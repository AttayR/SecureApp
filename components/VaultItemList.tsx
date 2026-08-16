import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View as RNView,
} from 'react-native';

import { clearVaultVideoThumb, VaultVideoThumb } from '@/components/VaultVideoThumb';
import { vaultTheme } from '@/constants/vaultTheme';
import { confirm, toast } from '@/lib/notify';
import { absoluteFilePath, deleteItem } from '@/lib/vaultStore';
import type { VaultItem } from '@/types/vault';
import type { VaultSelectionHandlers } from '@/hooks/useVaultBatchSelection';

type Props = {
  items: VaultItem[];
  refreshing: boolean;
  onRefresh: () => void;
  emptyHint: string;
  searchQuery?: string;
  /** Show media thumbnails for photo/video rows instead of generic icons. */
  showMediaThumbs?: boolean;
  /** @deprecated use showMediaThumbs */
  showPhotoThumbs?: boolean;
  onClearSearch?: () => void;
} & Partial<VaultSelectionHandlers>;

export function VaultItemList({
  items,
  refreshing,
  onRefresh,
  emptyHint,
  searchQuery = '',
  showMediaThumbs,
  showPhotoThumbs = false,
  onClearSearch,
  selecting = false,
  selectedIds,
  onToggleSelect,
  onEnterSelection,
}: Props) {
  const mediaThumbs = showMediaThumbs ?? showPhotoThumbs;
  const router = useRouter();

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, searchQuery]);

  const isSearchMiss = filtered.length === 0 && items.length > 0 && searchQuery.trim().length > 0;

  const confirmDelete = (item: VaultItem) => {
    void (async () => {
      const ok = await confirm({
        title: 'Delete from vault?',
        message: `"${item.name}" will be removed permanently from the vault. It will not be added to your gallery.`,
        confirmLabel: 'Delete',
        destructive: true,
      });
      if (!ok) return;
      try {
        await deleteItem(item);
        if (item.category === 'video') clearVaultVideoThumb(item.id);
        onRefresh();
        toast.success('Deleted', 'Item removed from vault.');
      } catch {
        toast.error('Could not delete', 'Something went wrong. Please try again.');
      }
    })();
  };

  return (
    <FlatList
      data={filtered}
      keyExtractor={(i) => i.id}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={vaultTheme.gold} />
      }
      contentContainerStyle={filtered.length === 0 ? styles.emptyContainer : [styles.list, selecting && styles.listSelecting]}
      ListEmptyComponent={
        <RNView style={styles.empty}>
          <RNView style={styles.emptyIconRing}>
            <FontAwesome
              name={isSearchMiss ? 'search' : 'inbox'}
              size={36}
              color={vaultTheme.goldMuted}
            />
          </RNView>
          <Text style={styles.emptyText}>
            {isSearchMiss ? `No items match “${searchQuery.trim()}”.` : emptyHint}
          </Text>
          {isSearchMiss && onClearSearch ? (
            <Pressable style={styles.clearSearchBtn} onPress={onClearSearch}>
              <Text style={styles.clearSearchText}>Clear search</Text>
            </Pressable>
          ) : null}
        </RNView>
      }
      renderItem={({ item }) => {
        const selected = !!selectedIds?.has(item.id);
        return (
        <RNView style={styles.rowWrap}>
          <Pressable
            style={({ pressed }) => [
              styles.row,
              selected && styles.rowSelected,
              pressed && styles.rowPressed,
            ]}
            onPress={() => {
              if (selecting && onToggleSelect) {
                onToggleSelect(item);
                return;
              }
              router.push({ pathname: '/viewer', params: { id: item.id } });
            }}
            onLongPress={() => onEnterSelection?.(item)}>
            {selecting ? (
              <RNView style={[styles.check, selected && styles.checkOn]}>
                {selected ? (
                  <FontAwesome name="check" size={11} color={vaultTheme.bgDeep} />
                ) : null}
              </RNView>
            ) : null}
            {mediaThumbs && item.category === 'photo' ? (
              <RNView style={styles.thumbBox}>
                <Image
                  source={{ uri: absoluteFilePath(item.fileName) }}
                  style={styles.thumbImg}
                  contentFit="cover"
                />
              </RNView>
            ) : mediaThumbs && item.category === 'video' ? (
              <RNView style={styles.thumbBox}>
                <VaultVideoThumb item={item} compact />
                <RNView style={styles.listPlayDot} pointerEvents="none">
                  <FontAwesome name="play" size={8} color={vaultTheme.bgDeep} />
                </RNView>
              </RNView>
            ) : (
              <RNView style={styles.iconRing}>
                <FontAwesome name={iconFor(item)} size={20} color={vaultTheme.gold} />
              </RNView>
            )}
            <RNView style={styles.rowText}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.rowMeta}>{new Date(item.createdAt).toLocaleString()}</Text>
            </RNView>
            {selecting ? null : (
              <FontAwesome name="chevron-right" size={14} color={vaultTheme.textMuted} />
            )}
          </Pressable>
          {selecting ? null : (
            <Pressable
              accessibilityLabel="Delete"
              hitSlop={12}
              onPress={() => confirmDelete(item)}
              style={styles.trash}>
              <FontAwesome name="trash" size={16} color={vaultTheme.danger} />
            </Pressable>
          )}
        </RNView>
        );
      }}
    />
  );
}

function iconFor(item: VaultItem) {
  switch (item.category) {
    case 'photo':
      return 'picture-o';
    case 'video':
      return 'file-video-o';
    case 'audio':
      return 'music';
    default:
      return 'file-o';
  }
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 12, paddingBottom: 24, paddingTop: 4 },
  listSelecting: { paddingBottom: 12 },
  emptyContainer: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  emptyIconRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: vaultTheme.bgGlass,
  },
  emptyText: { textAlign: 'center', color: vaultTheme.textSecondary, fontSize: 15, lineHeight: 22 },
  clearSearchBtn: {
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: vaultTheme.borderStrong,
    backgroundColor: vaultTheme.bgGlass,
  },
  clearSearchText: {
    color: vaultTheme.champagne,
    fontWeight: '700',
    fontSize: 14,
  },
  rowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: vaultTheme.bgSurface,
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
    shadowColor: vaultTheme.shadowGold,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 3,
  },
  rowPressed: { opacity: 0.92 },
  rowSelected: {
    borderColor: vaultTheme.gold,
    backgroundColor: vaultTheme.bgElevated,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: vaultTheme.borderStrong,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {
    backgroundColor: vaultTheme.gold,
    borderColor: vaultTheme.gold,
  },
  iconRing: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: vaultTheme.bgElevated,
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  thumbBox: {
    width: 52,
    height: 52,
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 12,
    borderWidth: 1,
    borderColor: vaultTheme.borderStrong,
    backgroundColor: vaultTheme.bgElevated,
  },
  thumbImg: { width: '100%', height: '100%' },
  listPlayDot: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: vaultTheme.gold,
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: vaultTheme.textPrimary },
  rowMeta: { fontSize: 12, color: vaultTheme.textMuted, marginTop: 4 },
  trash: { paddingHorizontal: 12, paddingVertical: 12 },
});
