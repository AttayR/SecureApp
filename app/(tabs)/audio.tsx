import { useNavigation } from '@react-navigation/native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useLayoutEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';

import { VaultItemList } from '@/components/VaultItemList';
import { VaultLuxuryBackground } from '@/components/VaultLuxuryBackground';
import { VaultSearchBar } from '@/components/VaultSearchBar';
import { vaultTheme } from '@/constants/vaultTheme';
import { useAuth } from '@/contexts/AuthContext';
import { useVaultItems } from '@/hooks/useVaultItems';
import { makeId } from '@/lib/ids';
import { addItem, ensureVaultReady } from '@/lib/vaultStore';

export default function AudioScreen() {
  const navigation = useNavigation();
  const { suppressBackgroundLock } = useAuth();
  const { items, refresh } = useVaultItems('audio');
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [importing, setImporting] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const pickAudio = useCallback(async () => {
    if (importing) return;

    setImporting(true);
    try {
      const releasePickerLock = suppressBackgroundLock();
      const res = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
        multiple: true,
      }).finally(releasePickerLock);
      if (res.canceled || !res.assets?.length) return;
      await ensureVaultReady();
      let ok = 0;
      let fail = 0;
      for (const file of res.assets) {
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
          ok++;
        } catch {
          fail++;
        }
      }
      await refresh();
      if (ok > 0) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (fail > 0 || ok > 1) {
        Alert.alert(
          'Import finished',
          `${ok} file${ok === 1 ? '' : 's'} imported.${fail ? ` ${fail} failed.` : ''}`
        );
      }
    } finally {
      setImporting(false);
    }
  }, [importing, refresh, suppressBackgroundLock]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => void pickAudio()}
          hitSlop={12}
          disabled={importing}
          style={styles.headerBtn}>
          <FontAwesome name="plus" size={22} color={vaultTheme.gold} />
        </Pressable>
      ),
    });
  }, [importing, navigation, pickAudio]);

  return (
    <VaultLuxuryBackground>
      <Text style={styles.hint}>You can select multiple audio files in one import.</Text>
      <VaultSearchBar value={query} onChangeText={setQuery} placeholder="Search audio…" />
      <VaultItemList
        items={items}
        refreshing={refreshing}
        onRefresh={() => void onRefresh()}
        emptyHint="Tap + to import music, recordings, or other audio."
        searchQuery={query}
      />
    </VaultLuxuryBackground>
  );
}

const styles = StyleSheet.create({
  hint: {
    color: vaultTheme.textSecondary,
    fontSize: 13,
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
  },
  headerBtn: { marginRight: 16, padding: 4 },
});
