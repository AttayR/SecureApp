import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
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

import { clearVaultVideoThumb, VaultVideoThumb } from '@/components/VaultVideoThumb';
import { vaultTheme } from '@/constants/vaultTheme';
import { confirm, toast } from '@/lib/notify';
import { deleteItem } from '@/lib/vaultStore';
import type { VaultItem } from '@/types/vault';

const GAP = 8;
const COLS = 3;
const PAD = 16;

type Props = {
  items: VaultItem[];
  searchQuery: string;
  refreshing: boolean;
  onRefresh: () => void;
  emptyHint: string;
  onClearSearch?: () => void;
};

export function VideoGalleryGrid({
  items,
  searchQuery,
  refreshing,
  onRefresh,
  emptyHint,
  onClearSearch,
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
          clearVaultVideoThumb(item.id);
          onRefresh();
          toast.success('Deleted', 'Video removed from vault.');
        } catch {
          toast.error('Could not delete', 'Something went wrong. Please try again.');
        }
      })();
    },
    [onRefresh]
  );

  const renderItem = useCallback(
    ({ item }: { item: VaultItem }) => (
      <View style={[styles.cellWrap, { width: cell }]}>
        <Pressable
          style={({ pressed }) => [styles.thumbPress, pressed && { opacity: 0.92 }]}
          onPress={() => router.push({ pathname: '/viewer', params: { id: item.id } })}
          accessibilityLabel={`Open ${item.name}`}>
          <View style={styles.thumbFrame}>
            <VaultVideoThumb item={item} />
          </View>
          <LinearGradient
            colors={['transparent', 'rgba(8,7,7,0.72)']}
            style={styles.thumbShade}
            pointerEvents="none"
          />
          <View style={styles.playBubble} pointerEvents="none">
            <FontAwesome name="play" size={11} color={vaultTheme.bgDeep} />
          </View>
          <View style={styles.thumbBorder} pointerEvents="none" />
        </Pressable>
        <Pressable
          style={styles.trashFab}
          onPress={() => confirmDelete(item)}
          hitSlop={8}
          accessibilityLabel={`Delete ${item.name}`}>
          <FontAwesome name="trash" size={12} color="#fff" />
        </Pressable>
      </View>
    ),
    [cell, confirmDelete, router]
  );

  if (filtered.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={styles.emptyScroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={vaultTheme.gold} />
        }>
        <FontAwesome
          name={isSearchMiss ? 'search' : 'file-video-o'}
          size={48}
          color={vaultTheme.textMuted}
        />
        <Text style={styles.emptyText}>
          {isSearchMiss ? `No videos match “${searchQuery.trim()}”.` : emptyHint}
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
      key={`video-grid-${Math.round(cell)}`}
      data={filtered}
      keyExtractor={(item) => item.id}
      numColumns={COLS}
      renderItem={renderItem}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.gridContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={vaultTheme.gold} />
      }
      initialNumToRender={9}
      maxToRenderPerBatch={6}
      windowSize={5}
      removeClippedSubviews={false}
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
  row: { gap: GAP, marginBottom: GAP },
  cellWrap: { position: 'relative' },
  thumbPress: { borderRadius: 12, overflow: 'hidden' },
  thumbFrame: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: vaultTheme.bgElevated,
  },
  thumbShade: {
    ...StyleSheet.absoluteFillObject,
  },
  playBubble: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: vaultTheme.gold,
  },
  thumbBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
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
