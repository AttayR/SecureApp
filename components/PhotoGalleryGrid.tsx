import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { vaultTheme } from '@/constants/vaultTheme';
import { confirm, toast } from '@/lib/notify';
import { absoluteFilePath, deleteItem } from '@/lib/vaultStore';
import type { VaultItem } from '@/types/vault';
import type { VaultSelectionHandlers } from '@/hooks/useVaultBatchSelection';

type Props = {
  items: VaultItem[];
  searchQuery: string;
  refreshing: boolean;
  onRefresh: () => void;
  emptyHint: string;
  onClearSearch?: () => void;
} & Partial<VaultSelectionHandlers>;

const GAP = 8;
const COLS = 3;
const PAD = 16;

export function PhotoGalleryGrid({
  items,
  searchQuery,
  refreshing,
  onRefresh,
  emptyHint,
  onClearSearch,
  selecting = false,
  selectedIds,
  onToggleSelect,
  onEnterSelection,
}: Props) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const cell = (width - PAD * 2 - GAP * (COLS - 1)) / COLS;

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, searchQuery]);

  const isSearchMiss = filtered.length === 0 && items.length > 0 && searchQuery.trim().length > 0;

  const confirmDelete = useCallback(
    (item: VaultItem) => {
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
          onRefresh();
          toast.success('Deleted', 'Photo removed from vault.');
        } catch {
          toast.error('Could not delete', 'Something went wrong. Please try again.');
        }
      })();
    },
    [onRefresh]
  );

  const renderItem = useCallback(
    ({ item }: { item: VaultItem }) => {
      const selected = !!selectedIds?.has(item.id);
      return (
        <View style={[styles.cellWrap, { width: cell }]}>
          <Pressable
            style={({ pressed }) => [styles.thumbPress, pressed && { opacity: 0.92 }]}
            onPress={() => {
              if (selecting && onToggleSelect) {
                onToggleSelect(item);
                return;
              }
              router.push({ pathname: '/viewer', params: { id: item.id } });
            }}
            onLongPress={() => onEnterSelection?.(item)}>
            <Image
              source={{ uri: absoluteFilePath(item.fileName) }}
              style={styles.thumb}
              contentFit="cover"
              transition={100}
            />
            <View style={[styles.thumbBorder, selected && styles.thumbBorderSelected]} />
            {selecting ? (
              <View style={[styles.checkBadge, selected && styles.checkBadgeOn]} pointerEvents="none">
                <FontAwesome
                  name={selected ? 'check' : 'circle-thin'}
                  size={selected ? 11 : 16}
                  color={selected ? vaultTheme.bgDeep : '#fff'}
                />
              </View>
            ) : null}
          </Pressable>
          {selecting ? null : (
            <Pressable
              style={styles.trashFab}
              onPress={() => confirmDelete(item)}
              hitSlop={8}
              accessibilityLabel={`Delete ${item.name}`}>
              <FontAwesome name="trash" size={12} color="#fff" />
            </Pressable>
          )}
        </View>
      );
    },
    [cell, confirmDelete, onEnterSelection, onToggleSelect, router, selectedIds, selecting]
  );

  if (filtered.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={styles.emptyScroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={vaultTheme.gold} />
        }>
        <FontAwesome
          name={isSearchMiss ? 'search' : 'picture-o'}
          size={48}
          color={vaultTheme.textMuted}
        />
        <Text style={styles.emptyText}>
          {isSearchMiss ? `No photos match “${searchQuery.trim()}”.` : emptyHint}
        </Text>
        {isSearchMiss && onClearSearch ? (
          <Pressable style={styles.clearSearchBtn} onPress={onClearSearch}>
            <Text style={styles.clearSearchText}>Clear search</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <FlatList
      key={`grid-${Math.round(cell)}`}
      data={filtered}
      keyExtractor={(item) => item.id}
      numColumns={COLS}
      renderItem={renderItem}
      columnWrapperStyle={styles.row}
      contentContainerStyle={[styles.gridContent, selecting && styles.gridContentSelecting]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={vaultTheme.gold} />
      }
      initialNumToRender={18}
      maxToRenderPerBatch={18}
      windowSize={7}
      removeClippedSubviews
    />
  );
}

const styles = StyleSheet.create({
  emptyScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 14,
  },
  emptyText: {
    color: vaultTheme.textSecondary,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
  },
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
  gridContent: { paddingHorizontal: PAD, paddingBottom: 32, paddingTop: 4 },
  gridContentSelecting: { paddingBottom: 16 },
  row: { gap: GAP, marginBottom: GAP },
  cellWrap: { position: 'relative' },
  thumbPress: { borderRadius: 12, overflow: 'hidden' },
  thumb: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: vaultTheme.bgElevated,
  },
  thumbBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
  },
  thumbBorderSelected: {
    borderColor: vaultTheme.gold,
    borderWidth: 2,
  },
  checkBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,7,7,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  checkBadgeOn: {
    backgroundColor: vaultTheme.gold,
    borderColor: vaultTheme.gold,
  },
  trashFab: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(232,93,111,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
