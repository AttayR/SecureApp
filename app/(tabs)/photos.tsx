import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { PhotoGalleryGrid } from '@/components/PhotoGalleryGrid';
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

const logImport = (...args: unknown[]) => {
  if (__DEV__) {
    console.log('[SecureAPP][PhotoImport]', ...args);
  }
};

export default function PhotosScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const { suppressBackgroundLock } = useAuth();
  const { items, refresh } = useVaultItems('photo');
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [galleryMode, setGalleryMode] = useState(true);
  const [importing, setImporting] = useState(false);
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

  const pickPhotos = useCallback(async () => {
    if (actionLockRef.current || importing || launchingMoveFlow) {
      logImport('Ignoring import tap while a flow is already active', {
        actionLocked: actionLockRef.current,
        importing,
        launchingMoveFlow,
      });
      return;
    }

    actionLockRef.current = true;
    let keepLockedForMove = false;

    try {
      const hideOriginal = await getHideGalleryAfterImport();
      logImport('hideOriginal (remove from gallery after import)', hideOriginal);

      if (Platform.OS === 'android' && hideOriginal) {
        keepLockedForMove = true;
        setLaunchingMoveFlow(true);
        logImport('Launching Android exact-id move flow');
        router.push({ pathname: '/gallery-move', params: { media: 'photo', origin: 'photos' } });
        return;
      }

      const releasePermissionLock = suppressBackgroundLock();
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync().finally(releasePermissionLock);
      logImport('ImagePicker permission', perm);
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow photo access to import into your vault.');
        return;
      }
      const releasePickerLock = suppressBackgroundLock();
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.92,
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: 0,
      }).finally(releasePickerLock);
      logImport('Picker result', {
        canceled: res.canceled,
        count: res.assets?.length ?? 0,
        assets: res.assets?.map((a) => ({
          uri: a.uri,
          fileName: a.fileName,
          fileSize: a.fileSize,
          mimeType: a.mimeType,
          width: a.width,
          height: a.height,
          assetId: a.assetId,
          originalRemovedNatively: a.originalRemovedNatively,
        })),
      });
      if (res.canceled || !res.assets?.length) {
        logImport('Import aborted (canceled or empty selection)');
        return;
      }

      setImporting(true);
      await ensureVaultReady();
      let ok = 0;
      let fail = 0;
      let hideFailed = 0;
      let skippedHideNoId = 0;
      for (const a of res.assets) {
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
          ok++;
          logImport('Copied to vault', { vaultId: id, vaultFileName: fileName, sourceUri: a.uri });
          if (hideOriginal) {
            if (a.originalRemovedNatively === true) {
              logImport('Gallery: native already removed original', { fileName: a.fileName });
            } else if (a.assetId) {
              const removed = await removeGalleryAsset(a.assetId);
              logImport('Gallery: MediaLibrary.delete', { assetId: a.assetId, removed });
              if (!removed) hideFailed++;
            } else {
              skippedHideNoId++;
              logImport('Gallery: could not remove (no assetId, native did not remove)', {
                fileName: a.fileName,
              });
            }
          }
        } catch (e) {
          fail++;
          logImport('Import item failed', { fileName: a.fileName, error: String(e) });
        }
      }
      await refresh();
      logImport('Import batch done', { ok, fail, hideFailed, skippedHideNoId, hideOriginal });
      if (ok > 0) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      if (skippedHideNoId > 0 || hideFailed > 0) {
        const lines: string[] = [`${ok} photo(s) are in your vault.`];
        if (skippedHideNoId > 0) {
          lines.push(
            `${skippedHideNoId} could not be auto-removed (no library ID from the picker). Delete those copies in the gallery if you want them gone.`
          );
        }
        if (hideFailed > 0) {
          lines.push(
            `${hideFailed} original(s) could not be deleted — allow full Photos access for this app in system settings, or remove duplicates manually.`
          );
        }
        Alert.alert('Gallery copies may remain', lines.join(' '));
      } else if (fail > 0) {
        Alert.alert(
          'Import finished',
          `${ok} photo${ok === 1 ? '' : 's'} imported.${fail ? ` ${fail} could not be copied.` : ''}`
        );
      } else if (ok > 1) {
        Alert.alert('Imported', `${ok} photos added to your vault.`);
      }
    } finally {
      if (!keepLockedForMove) {
        actionLockRef.current = false;
      }
      setImporting(false);
    }
  }, [importing, launchingMoveFlow, refresh, router, suppressBackgroundLock]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => {
              setGalleryMode((g) => !g);
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            hitSlop={10}
            style={styles.headerBtn}>
            <FontAwesome name={galleryMode ? 'list' : 'th-large'} size={20} color={vaultTheme.gold} />
          </Pressable>
          <Pressable
            onPress={() => void pickPhotos()}
            hitSlop={10}
            disabled={importing || launchingMoveFlow}
            style={styles.headerBtn}>
            {importing || launchingMoveFlow ? (
              <ActivityIndicator color={vaultTheme.gold} size="small" />
            ) : (
              <FontAwesome name="plus" size={22} color={vaultTheme.gold} />
            )}
          </Pressable>
        </View>
      ),
    });
  }, [navigation, pickPhotos, galleryMode, importing, launchingMoveFlow]);

  return (
    <VaultLuxuryBackground>
      <Text style={styles.hint}>
        Multi-select in the picker. On Android, turning on “Remove originals from gallery” opens a
        move-from-gallery view so AR Vault can copy exact items into the vault and remove those
        originals after import. Toggle grid/list from the header.
      </Text>
      <VaultSearchBar value={query} onChangeText={setQuery} placeholder="Search photos…" />
      {galleryMode ? (
        <PhotoGalleryGrid
          items={items}
          searchQuery={query}
          refreshing={refreshing}
          onRefresh={() => void onRefresh()}
          emptyHint="Tap + to import photos. On Android, “Remove originals” opens a move-from-gallery flow; otherwise imports keep the public copy."
        />
      ) : (
        <VaultItemList
          items={items}
          refreshing={refreshing}
          onRefresh={() => void onRefresh()}
          emptyHint="Tap + to import photos. Switch to grid view for a gallery layout."
          searchQuery={query}
          showPhotoThumbs
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
