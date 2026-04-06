import { useNavigation } from '@react-navigation/native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as DocumentPicker from 'expo-document-picker';
import React, { useCallback, useLayoutEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { VaultItemList } from '@/components/VaultItemList';
import { useVaultItems } from '@/hooks/useVaultItems';
import { makeId } from '@/lib/ids';
import { addItem, ensureVaultReady } from '@/lib/vaultStore';

export default function DocumentsScreen() {
  const navigation = useNavigation();
  const { items, refresh } = useVaultItems('document');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const pickDoc = useCallback(async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const file = res.assets[0];
    await ensureVaultReady();
    const id = makeId();
    const base = file.name ?? 'document';
    const extMatch = base.match(/\.(\w+)$/);
    const ext = extMatch?.[1]?.toLowerCase() ?? 'bin';
    const fileName = `${id}.${ext}`;
    try {
      await addItem(
        {
          id,
          category: 'document',
          name: file.name ?? `Document ${new Date().toLocaleString()}`,
          fileName,
          createdAt: Date.now(),
          mimeType: file.mimeType,
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
        <Pressable onPress={() => void pickDoc()} hitSlop={12} style={styles.headerBtn}>
          <FontAwesome name="plus" size={22} color="#6e5494" />
        </Pressable>
      ),
    });
  }, [navigation, pickDoc]);

  return (
    <View style={styles.flex}>
      <VaultItemList
        items={items}
        refreshing={refreshing}
        onRefresh={() => void onRefresh()}
        emptyHint="Tap + to import PDFs, Office files, zip archives, or any file type."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerBtn: { marginRight: 16, padding: 4 },
});
