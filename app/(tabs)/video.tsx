import { useFocusEffect, useNavigation } from '@react-navigation/native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ShowcaseModeToggle } from '@/components/ShowcaseModeToggle';
import { VideoGalleryGrid } from '@/components/VideoGalleryGrid';
import { VaultItemList } from '@/components/VaultItemList';
import { VaultLuxuryBackground } from '@/components/VaultLuxuryBackground';
import { VaultSearchBar } from '@/components/VaultSearchBar';
import { vaultTheme } from '@/constants/vaultTheme';
import { useAuth } from '@/contexts/AuthContext';
import { useVaultItems } from '@/hooks/useVaultItems';
import { removeGalleryAssets } from '@/lib/galleryVault';
import { makeId } from '@/lib/ids';
import { toast } from '@/lib/notify';
import {
  getHideGalleryAfterImport,
  getShowcaseMode,
  setShowcaseMode,
  type ShowcaseMode,
} from '@/lib/vaultPrefs';
import { addItem, ensureVaultReady } from '@/lib/vaultStore';

export default function VideoScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const { suppressBackgroundLock } = useAuth();
  const { items, refresh } = useVaultItems('video');
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [showcaseMode, setShowcaseModeState] = useState<ShowcaseMode>('icons');
  const [launchingMoveFlow, setLaunchingMoveFlow] = useState(false);
  const actionLockRef = useRef(false);

  useEffect(() => {
    void getShowcaseMode('video').then(setShowcaseModeState);
  }, []);

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

  const clearSearch = useCallback(() => setQuery(''), []);

  const onShowcaseChange = useCallback((mode: ShowcaseMode) => {
    setShowcaseModeState(mode);
    void setShowcaseMode('video', mode);
  }, []);

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
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync().finally(
        releasePermissionLock
      );
      if (!perm.granted) {
        toast.warning('Permission needed', 'Allow access to videos to import into the vault.');
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
      let skippedHideNoId = 0;
      const assetIdsToRemove: string[] = [];
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
              assetIdsToRemove.push(a.assetId);
            } else {
              skippedHideNoId++;
            }
          }
        } catch {
          fail++;
        }
      }
      let hideFailed = 0;
      if (hideOriginal && assetIdsToRemove.length > 0) {
        const releaseDeleteLock = suppressBackgroundLock();
        try {
          const removed = await removeGalleryAssets(assetIdsToRemove);
          hideFailed = Math.max(0, assetIdsToRemove.length - removed);
        } finally {
          releaseDeleteLock();
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
        toast.warning('Gallery copies may remain', lines.join(' '));
      } else if (fail > 0) {
        toast.info(
          'Import finished',
          `${ok} video${ok === 1 ? '' : 's'} imported.${fail ? ` ${fail} failed.` : ''}`
        );
      } else if (ok > 1) {
        toast.success('Imported', `${ok} videos added to your vault.`);
      } else if (ok === 1) {
        toast.success('Imported', 'Video added to your vault.');
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
        <View style={styles.headerRow}>
          <ShowcaseModeToggle mode={showcaseMode} onChange={onShowcaseChange} />
          <Pressable
            onPress={() => void pickVideos()}
            hitSlop={12}
            disabled={launchingMoveFlow}
            style={styles.headerBtn}
            accessibilityLabel="Import videos">
            <FontAwesome name="plus" size={22} color={vaultTheme.gold} />
          </Pressable>
        </View>
      ),
    });
  }, [launchingMoveFlow, navigation, onShowcaseChange, pickVideos, showcaseMode]);

  return (
    <VaultLuxuryBackground>
      <Text style={styles.hint}>
        Tap + to import. Use the header switch for Icons or List view. Turn on “Remove originals
        from gallery” in Settings to keep videos private after import.
      </Text>
      <VaultSearchBar value={query} onChangeText={setQuery} placeholder="Search videos…" />
      {showcaseMode === 'icons' ? (
        <VideoGalleryGrid
          items={items}
          searchQuery={query}
          refreshing={refreshing}
          onRefresh={() => void onRefresh()}
          onClearSearch={clearSearch}
          emptyHint="No videos yet. Tap + to import into your private vault."
        />
      ) : (
        <VaultItemList
          items={items}
          refreshing={refreshing}
          onRefresh={() => void onRefresh()}
          onClearSearch={clearSearch}
          emptyHint="No videos yet. Tap + to import, or switch to Icons view."
          searchQuery={query}
          showMediaThumbs
        />
      )}
    </VaultLuxuryBackground>
  );
}

const styles = StyleSheet.create({
  hint: {
    color: vaultTheme.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginRight: 8, gap: 4 },
  headerBtn: { padding: 8 },
});
