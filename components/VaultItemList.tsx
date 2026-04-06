import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View as RNView,
} from 'react-native';

import { Text, View } from '@/components/Themed';
import { absoluteFilePath, deleteItem } from '@/lib/vaultStore';
import type { VaultItem } from '@/types/vault';

type Props = {
  items: VaultItem[];
  refreshing: boolean;
  onRefresh: () => void;
  emptyHint: string;
};

export function VaultItemList({ items, refreshing, onRefresh, emptyHint }: Props) {
  const router = useRouter();

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
      data={items}
      keyExtractor={(i) => i.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      contentContainerStyle={items.length === 0 ? styles.emptyContainer : styles.list}
      ListEmptyComponent={
        <View style={styles.empty}>
          <FontAwesome name="inbox" size={40} color="#888" />
          <Text style={styles.emptyText}>{emptyHint}</Text>
        </View>
      }
      renderItem={({ item }) => (
        <RNView style={styles.rowWrap}>
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => router.push({ pathname: '/viewer', params: { id: item.id } })}>
            <FontAwesome
              name={iconFor(item)}
              size={22}
              color="#6e5494"
              style={styles.rowIcon}
            />
            <RNView style={styles.rowText}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.rowMeta}>{new Date(item.createdAt).toLocaleString()}</Text>
            </RNView>
            <FontAwesome name="chevron-right" size={16} color="#888" />
          </Pressable>
          <Pressable
            accessibilityLabel="Delete"
            hitSlop={12}
            onPress={() => confirmDelete(item)}
            style={styles.trash}>
            <FontAwesome name="trash" size={18} color="#f85149" />
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
  list: { paddingVertical: 8 },
  emptyContainer: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyText: { textAlign: 'center', opacity: 0.7 },
  rowWrap: { flexDirection: 'row', alignItems: 'center' },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333',
  },
  rowPressed: { opacity: 0.85 },
  rowIcon: { marginRight: 12 },
  rowText: { flex: 1, backgroundColor: 'transparent' },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowMeta: { fontSize: 12, opacity: 0.6, marginTop: 2 },
  trash: { paddingHorizontal: 14, paddingVertical: 12 },
});
