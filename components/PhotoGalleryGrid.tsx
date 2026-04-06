import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import {
  Alert,
  Dimensions,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { vaultTheme } from '@/constants/vaultTheme';
import { absoluteFilePath, deleteItem } from '@/lib/vaultStore';
import type { VaultItem } from '@/types/vault';

const GAP = 8;
const COLS = 3;
const pad = 16;
const cell = (Dimensions.get('window').width - pad * 2 - GAP * (COLS - 1)) / COLS;

type Props = {
  items: VaultItem[];
  searchQuery: string;
  refreshing: boolean;
  onRefresh: () => void;
  emptyHint: string;
};

export function PhotoGalleryGrid({ items, searchQuery, refreshing, onRefresh, emptyHint }: Props) {
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

  if (filtered.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={styles.emptyScroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={vaultTheme.gold} />}>
        <FontAwesome name="picture-o" size={48} color={vaultTheme.textMuted} />
        <Text style={styles.emptyText}>{emptyHint}</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={vaultTheme.gold} />}
      contentContainerStyle={styles.gridContent}>
      <View style={styles.grid}>
        {filtered.map((item) => (
          <View key={item.id} style={[styles.cellWrap, { width: cell }]}>
            <Pressable
              style={({ pressed }) => [styles.thumbPress, pressed && { opacity: 0.92 }]}
              onPress={() => router.push({ pathname: '/viewer', params: { id: item.id } })}>
              <Image source={{ uri: absoluteFilePath(item.fileName) }} style={styles.thumb} />
              <View style={styles.thumbBorder} />
            </Pressable>
            <Pressable style={styles.trashFab} onPress={() => confirmDelete(item)} hitSlop={8}>
              <FontAwesome name="trash" size={12} color="#fff" />
            </Pressable>
          </View>
        ))}
      </View>
    </ScrollView>
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
  emptyText: { color: vaultTheme.textSecondary, textAlign: 'center', fontSize: 15, lineHeight: 22 },
  gridContent: { paddingHorizontal: pad, paddingBottom: 32, paddingTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
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
