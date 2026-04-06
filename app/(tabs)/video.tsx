import { useFocusEffect, useNavigation } from '@react-navigation/native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text } from 'react-native';

import { VaultItemList } from '@/components/VaultItemList';
import { VaultLuxuryBackground } from '@/components/VaultLuxuryBackground';
import { VaultSearchBar } from '@/components/VaultSearchBar';
import { vaultTheme } from '@/constants/vaultTheme';
import { useAuth } from '@/contexts/AuthContext';
import { useVaultItems } from '@/hooks/useVaultItems';
import { removeGalleryAsset } from '@/lib/galleryVault';
import { makeId } from '@/lib/ids';
import { getHideGalleryAfterImport } from '@/lib/vaultPrefs';
import { addItem, ensureVaultReady } from '@/lib/vaultStore';

export default function VideoScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const { suppressBackgroundLock } = useAuth();
  const { items, refresh } = useVaultItems('video');
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [launchingMoveFlow, setLaunchingMoveFlow] = useState(false);
  const actionLockRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      actionLockRef.current = false;
      setLaunchingMoveFlow(false);
    }, [])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const pickVideos = useCallback(async () => {
    if (actionLockRef.current || launchingMoveFlow) {
      return;
    }

    actionLockRef.current = true;
    let keepLockedForMove = false;

    try {
      const hideOriginal = await getHideGalleryAfterImport();
      if (Platform.OS === 'android' && hideOriginal) {
        keepLockedForMove = true;
        setLaunchingMoveFlow(true);
        router.push({ pathname: '/gallery-move', params: { media: 'video', origin: 'video' } });
        return;
      }

      const releasePermissionLock = suppressBackgroundLock();
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync().finally(releasePermissionLock);
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow access to videos to import into the vault.');
        return;
      }
      const releasePickerLock = suppressBackgroundLock();
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        quality: 1,
        allowsMultipleSelection: true,
        selectionLimit: 0,
      }).finally(releasePickerLock);
      if (res.canceled || !res.assets?.length) return;
      await ensureVaultReady();
      let ok = 0;
      let fail = 0;
      let hideFailed = 0;
      let skippedHideNoId = 0;
      for (const a of res.assets) {
        const id = makeId();
        const extMatch = a.uri.match(/\.(\w+)(?:\?|$)/);
        const ext = extMatch?.[1]?.toLowerCase() ?? 'mp4';
        const fileName = `${id}.${ext}`;
        try {
          await addItem(
            {
              id,
              category: 'video',
              name: a.fileName ?? `Video ${new Date().toLocaleString()}`,
              fileName,
              createdAt: Date.now(),
              mimeType: a.mimeType ?? 'video/mp4',
            },
            a.uri
          );
          ok++;
          if (hideOriginal) {
            if (a.originalRemovedNatively === true) {
              /* native ContentResolver.delete already removed gallery row */
            } else if (a.assetId) {
              const removed = await removeGalleryAsset(a.assetId);
              if (!removed) hideFailed++;
            } else {
              skippedHideNoId++;
            }
          }
        } catch {
          fail++;
        }
      }
      await refresh();
      if (ok > 0) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (skippedHideNoId > 0 || hideFailed > 0) {
        const lines: string[] = [`${ok} video(s) are in your vault.`];
        if (skippedHideNoId > 0) {
          lines.push(
            `${skippedHideNoId} could not be auto-removed from the gallery (no library ID). Delete those copies manually if you want them gone.`
          );
        }
        if (hideFailed > 0) {
          lines.push(
            `${hideFailed} original(s) could not be deleted — allow full Photos/video access in system settings.`
          );
        }
        Alert.alert('Gallery copies may remain', lines.join(' '));
      } else if (fail > 0 || ok > 1) {
        Alert.alert(
          'Import finished',
          `${ok} video${ok === 1 ? '' : 's'} imported.${fail ? ` ${fail} failed.` : ''}`
        );
      }
    } finally {
      if (!keepLockedForMove) {
        actionLockRef.current = false;
      }
    }
  }, [launchingMoveFlow, refresh, router, suppressBackgroundLock]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => void pickVideos()}
          hitSlop={12}
          disabled={launchingMoveFlow}
          style={styles.headerBtn}>
          <FontAwesome name="plus" size={22} color={vaultTheme.gold} />
        </Pressable>
      ),
    });
  }, [navigation, pickVideos]);

  return (
    <VaultLuxuryBackground>
      <Text style={styles.hint}>
        Select multiple videos from your library. On Android, turning on “Remove originals from
        gallery” opens a move-from-gallery view so AR Vault can remove the exact original after a
        successful import.
      </Text>
      <VaultSearchBar value={query} onChangeText={setQuery} placeholder="Search videos…" />
      <VaultItemList
        items={items}
        refreshing={refreshing}
        onRefresh={() => void onRefresh()}
        emptyHint="Tap + to import videos. On Android, “Remove originals” opens a move-from-gallery flow; otherwise imports keep the public copy."
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
