import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { PhotoGalleryGrid } from '@/components/PhotoGalleryGrid';
import { ShowcaseModeToggle } from '@/components/ShowcaseModeToggle';
import { VaultItemList } from '@/components/VaultItemList';
import { VaultLuxuryBackground } from '@/components/VaultLuxuryBackground';
import { VaultSearchBar } from '@/components/VaultSearchBar';
import { VaultSelectionBar } from '@/components/VaultSelectionBar';
import { vaultTheme } from '@/constants/vaultTheme';
import { useAuth } from '@/contexts/AuthContext';
import { useVaultBatchActions, useVaultBatchSelection } from '@/hooks/useVaultBatchSelection';
import { useVaultItems } from '@/hooks/useVaultItems';
import { removeGalleryAssets, resolveGalleryOrigin } from '@/lib/galleryVault';
import { makeId } from '@/lib/ids';
import { toast } from '@/lib/notify';
import {
  getHideGalleryAfterImport,
  getShowcaseMode,
  setShowcaseMode,
  type ShowcaseMode,
} from '@/lib/vaultPrefs';
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
  const [showcaseMode, setShowcaseModeState] = useState<ShowcaseMode>('icons');
  const [importing, setImporting] = useState(false);
  const [launchingMoveFlow, setLaunchingMoveFlow] = useState(false);
  const actionLockRef = useRef(false);
  const selection = useVaultBatchSelection(items, query);
  const { busy: batchBusy, shareSelected, releaseSelected } = useVaultBatchActions({
    noun: 'photo',
    selectedItems: selection.selectedItems,
    suppressBackgroundLock,
    refresh,
    exitSelection: selection.exitSelection,
  });

  useEffect(() => {
    void getShowcaseMode('photo').then(setShowcaseModeState);
  }, []);

  useFocusEffect(
    useCallback(() => {
      actionLockRef.current = false;
      setLaunchingMoveFlow(false);
    }, [])
  );

  const onShowcaseChange = useCallback((mode: ShowcaseMode) => {
    setShowcaseModeState(mode);
    void setShowcaseMode('photo', mode);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const clearSearch = useCallback(() => setQuery(''), []);

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
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync().finally(
        releasePermissionLock
      );
      logImport('ImagePicker permission', perm);
      if (!perm.granted) {
        toast.warning('Permission needed', 'Allow photo access to import into your vault.');
        return;
      }
      const releasePickerLock = suppressBackgroundLock();
      // quality: 1 keeps original bytes (no recompress). Critical when originals are removed.
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
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
      let skippedHideNoId = 0;
      const assetIdsToRemove: string[] = [];

      for (const a of res.assets) {
        const id = makeId();
        const extMatch = a.uri.match(/\.(\w+)(?:\?|$)/);
        const ext = extMatch?.[1]?.toLowerCase() ?? 'jpg';
        const fileName = `${id}.${ext}`;
        const origin = await resolveGalleryOrigin(a.assetId);
        try {
          await addItem(
            {
              id,
              category: 'photo',
              name: a.fileName ?? `Photo ${new Date().toLocaleString()}`,
              fileName,
              createdAt: Date.now(),
              mimeType: a.mimeType ?? 'image/jpeg',
              ...origin,
            },
            a.uri
          );
          ok++;
          logImport('Copied to vault', { vaultId: id, vaultFileName: fileName, sourceUri: a.uri });
          if (hideOriginal) {
            if (a.originalRemovedNatively === true) {
              logImport('Gallery: native already removed original', { fileName: a.fileName });
            } else if (a.assetId) {
              assetIdsToRemove.push(a.assetId);
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

      let hideFailed = 0;
      if (hideOriginal && assetIdsToRemove.length > 0) {
        const releaseDeleteLock = suppressBackgroundLock();
        try {
          const removed = await removeGalleryAssets(assetIdsToRemove);
          hideFailed = Math.max(0, assetIdsToRemove.length - removed);
          logImport('Gallery: batch MediaLibrary.delete', {
            requested: assetIdsToRemove.length,
            removed,
            hideFailed,
          });
        } finally {
          releaseDeleteLock();
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
        toast.warning('Gallery copies may remain', lines.join(' '));
      } else if (fail > 0) {
        toast.info(
          'Import finished',
          `${ok} photo${ok === 1 ? '' : 's'} imported.${fail ? ` ${fail} could not be copied.` : ''}`
        );
      } else if (ok > 1) {
        toast.success('Imported', `${ok} photos added to your vault.`);
      } else if (ok === 1) {
        toast.success('Imported', 'Photo added to your vault.');
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
          {selection.selecting ? (
            <Pressable
              onPress={selection.allVisibleSelected ? selection.clearSelected : selection.selectAllVisible}
              hitSlop={10}
              disabled={batchBusy || selection.visibleCount === 0}
              style={styles.headerBtn}
              accessibilityLabel={selection.allVisibleSelected ? 'Clear selection' : 'Select all photos'}>
              <Text style={styles.headerSelectAll}>
                {selection.allVisibleSelected ? 'Clear' : 'Select all'}
              </Text>
            </Pressable>
          ) : (
            <>
              <ShowcaseModeToggle mode={showcaseMode} onChange={onShowcaseChange} />
              <Pressable
                onPress={() => selection.enterSelection()}
                hitSlop={10}
                disabled={items.length === 0}
                style={styles.headerBtn}
                accessibilityLabel="Select photos">
                <FontAwesome
                  name="check-square-o"
                  size={20}
                  color={items.length === 0 ? vaultTheme.textMuted : vaultTheme.gold}
                />
              </Pressable>
              <Pressable
                onPress={() => void pickPhotos()}
                hitSlop={10}
                disabled={importing || launchingMoveFlow}
                style={styles.headerBtn}
                accessibilityLabel="Import photos">
                {importing || launchingMoveFlow ? (
                  <ActivityIndicator color={vaultTheme.gold} size="small" />
                ) : (
                  <FontAwesome name="plus" size={22} color={vaultTheme.gold} />
                )}
              </Pressable>
            </>
          )}
        </View>
      ),
    });
  }, [
    batchBusy,
    importing,
    items.length,
    launchingMoveFlow,
    navigation,
    onShowcaseChange,
    pickPhotos,
    selection.allVisibleSelected,
    selection.clearSelected,
    selection.enterSelection,
    selection.selectAllVisible,
    selection.selecting,
    selection.visibleCount,
    showcaseMode,
  ]);

  return (
    <VaultLuxuryBackground>
      <Text style={styles.hint}>
        Tap + to import. Long-press or use Select to share or move several photos back to your
        gallery.
      </Text>
      <VaultSearchBar value={query} onChangeText={setQuery} placeholder="Search photos…" />
      {showcaseMode === 'icons' ? (
        <PhotoGalleryGrid
          items={items}
          searchQuery={query}
          refreshing={refreshing}
          onRefresh={() => void onRefresh()}
          onClearSearch={clearSearch}
          emptyHint="No photos yet. Tap + to import into your private vault."
          selecting={selection.selecting}
          selectedIds={selection.selectedIds}
          onToggleSelect={selection.toggleSelect}
          onEnterSelection={selection.enterSelection}
        />
      ) : (
        <VaultItemList
          items={items}
          refreshing={refreshing}
          onRefresh={() => void onRefresh()}
          onClearSearch={clearSearch}
          emptyHint="No photos yet. Tap + to import, or switch to Icons view."
          searchQuery={query}
          showMediaThumbs
          selecting={selection.selecting}
          selectedIds={selection.selectedIds}
          onToggleSelect={selection.toggleSelect}
          onEnterSelection={selection.enterSelection}
        />
      )}
      {selection.selecting ? (
        <VaultSelectionBar
          noun="photo"
          selectedCount={selection.selectedCount}
          visibleCount={selection.visibleCount}
          allSelected={selection.allVisibleSelected}
          busy={batchBusy}
          onSelectAll={selection.selectAllVisible}
          onClear={selection.clearSelected}
          onShare={shareSelected}
          onRelease={releaseSelected}
          onCancel={selection.exitSelection}
        />
      ) : null}
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
  headerSelectAll: { color: vaultTheme.gold, fontWeight: '800', fontSize: 14, paddingHorizontal: 4 },
});
