import { useNavigation } from '@react-navigation/native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useLayoutEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { VaultItemList } from '@/components/VaultItemList';
import { useVaultItems } from '@/hooks/useVaultItems';
import { makeId } from '@/lib/ids';
import { addItem, ensureVaultReady } from '@/lib/vaultStore';

export default function PhotosScreen() {
  const navigation = useNavigation();
  const { items, refresh } = useVaultItems('photo');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const pickPhoto = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to import into the vault.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    await ensureVaultReady();
    const id = makeId();
    const extMatch = a.uri.match(/\.(\w+)(?:\?|$)/);
    const ext = extMatch?.[1]?.toLowerCase() ?? 'jpg';
    const fileName = `${id}.${ext}`;
    try {
      await addItem(
        {
          id,
          category: 'photo',
          name: a.fileName ?? `Photo ${new Date().toLocaleString()}`,
          fileName,
          createdAt: Date.now(),
          mimeType: a.mimeType ?? 'image/jpeg',
        },
        a.uri
      );
      await refresh();
    } catch {
      Alert.alert('Import failed', 'Could not copy this file into the vault.');
    }
  }, [refresh]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => void pickPhoto()} hitSlop={12} style={styles.headerBtn}>
          <FontAwesome name="plus" size={22} color="#6e5494" />
        </Pressable>
      ),
    });
  }, [navigation, pickPhoto]);

  return (
    <View style={styles.flex}>
      <VaultItemList
        items={items}
        refreshing={refreshing}
        onRefresh={() => void onRefresh()}
        emptyHint="Tap + to import photos. Originals can stay in your gallery or be deleted separately."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerBtn: { marginRight: 16, padding: 4 },
});
