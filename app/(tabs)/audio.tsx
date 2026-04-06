import { useNavigation } from '@react-navigation/native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as DocumentPicker from 'expo-document-picker';
import React, { useCallback, useLayoutEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { VaultItemList } from '@/components/VaultItemList';
import { useVaultItems } from '@/hooks/useVaultItems';
import { makeId } from '@/lib/ids';
import { addItem, ensureVaultReady } from '@/lib/vaultStore';

export default function AudioScreen() {
  const navigation = useNavigation();
  const { items, refresh } = useVaultItems('audio');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const pickAudio = useCallback(async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: 'audio/*',
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const file = res.assets[0];
    await ensureVaultReady();
    const id = makeId();
    const base = file.name ?? 'audio';
    const extMatch = base.match(/\.(\w+)$/);
    const ext = extMatch?.[1]?.toLowerCase() ?? 'm4a';
    const fileName = `${id}.${ext}`;
    try {
      await addItem(
        {
          id,
          category: 'audio',
          name: file.name ?? `Audio ${new Date().toLocaleString()}`,
          fileName,
          createdAt: Date.now(),
          mimeType: file.mimeType ?? 'audio/*',
        },
        file.uri
      );
      await refresh();
    } catch {
      Alert.alert('Import failed', 'Could not copy this file into the vault.');
    }
  }, [refresh]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => void pickAudio()} hitSlop={12} style={styles.headerBtn}>
          <FontAwesome name="plus" size={22} color="#6e5494" />
        </Pressable>
      ),
    });
  }, [navigation, pickAudio]);

  return (
    <View style={styles.flex}>
      <VaultItemList
        items={items}
        refreshing={refreshing}
        onRefresh={() => void onRefresh()}
        emptyHint="Tap + to pick audio files (music, recordings, etc.)."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerBtn: { marginRight: 16, padding: 4 },
});
