import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View as RNView,
} from 'react-native';

import { vaultTheme } from '@/constants/vaultTheme';
import { absoluteFilePath, deleteItem } from '@/lib/vaultStore';
import type { VaultItem } from '@/types/vault';

type Props = {
  items: VaultItem[];
  refreshing: boolean;
  onRefresh: () => void;
  emptyHint: string;
  searchQuery?: string;
  showPhotoThumbs?: boolean;
};

export function VaultItemList({
  items,
  refreshing,
  onRefresh,
  emptyHint,
  searchQuery = '',
  showPhotoThumbs = false,
}: Props) {
  const router = useRouter();

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, searchQuery]);

  const confirmDelete = (item: VaultItem) => {
    Alert.alert('Remove from vault?', item.name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteItem(item);
          onRefresh();
        },
      },
    ]);
  };

  return (
    <FlatList
      data={filtered}
      keyExtractor={(i) => i.id}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={vaultTheme.gold} />
      }
      contentContainerStyle={filtered.length === 0 ? styles.emptyContainer : styles.list}
      ListEmptyComponent={
        <RNView style={styles.empty}>
          <RNView style={styles.emptyIconRing}>
            <FontAwesome name="inbox" size={36} color={vaultTheme.goldMuted} />
          </RNView>
          <Text style={styles.emptyText}>{emptyHint}</Text>
        </RNView>
      }
      renderItem={({ item }) => (
        <RNView style={styles.rowWrap}>
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => router.push({ pathname: '/viewer', params: { id: item.id } })}>
            {showPhotoThumbs && item.category === 'photo' ? (
              <RNView style={styles.thumbBox}>
                <Image source={{ uri: absoluteFilePath(item.fileName) }} style={styles.thumbImg} />
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
            <FontAwesome name="chevron-right" size={14} color={vaultTheme.textMuted} />
          </Pressable>
          <Pressable
            accessibilityLabel="Delete"
            hitSlop={12}
            onPress={() => confirmDelete(item)}
            style={styles.trash}>
            <FontAwesome name="trash" size={16} color={vaultTheme.danger} />
          </Pressable>
        </RNView>
      )}
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
  },
  thumbImg: { width: '100%', height: '100%' },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: vaultTheme.textPrimary },
  rowMeta: { fontSize: 12, color: vaultTheme.textMuted, marginTop: 4 },
  trash: { paddingHorizontal: 12, paddingVertical: 12 },
});
