import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VaultLuxuryBackground } from '@/components/VaultLuxuryBackground';
import { vaultTheme } from '@/constants/vaultTheme';
import { useAuth } from '@/contexts/AuthContext';
import { getVideoThumbnailUri } from '@/lib/vaultAndroid';
import { moveMediaLibraryAssetsToVault, type MediaStoreMoveAsset } from '@/lib/mediaLibraryMove';

const GAP = 8;
const GRID_PAD = 16;
const COLS = 3;
const PAGE_SIZE = 90;
const CELL = (Dimensions.get('window').width - GRID_PAD * 2 - GAP * (COLS - 1)) / COLS;

type MoveMediaParam = 'photo' | 'video';
type OriginTabParam = 'photos' | 'video';

const videoThumbnailCache = new Map<string, string | null>();
const videoThumbnailTasks = new Map<string, Promise<string | null>>();

const logMove = (...args: unknown[]) => {
  if (__DEV__) {
    console.log('[SecureAPP][GalleryMove]', ...args);
  }
};

function resolveMediaParam(value: string | string[] | undefined): MoveMediaParam | null {
  const first = Array.isArray(value) ? value[0] : value;
  return first === 'photo' || first === 'video' ? first : null;
}

function resolveOriginTab(value: string | string[] | undefined): OriginTabParam | null {
  const first = Array.isArray(value) ? value[0] : value;
  return first === 'photos' || first === 'video' ? first : null;
}

function pluralize(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function formatDuration(durationSeconds?: number): string {
  if (!durationSeconds || durationSeconds <= 0) return '0:00';
  const totalSeconds = Math.round(durationSeconds);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function thumbnailTimeForAsset(asset: MediaLibrary.Asset): number {
  if (!asset.duration || asset.duration <= 0) return 0;
  if (asset.duration <= 1) return 0;
  return Math.min(1, asset.duration * 0.18);
}

async function loadVideoThumbnail(asset: MediaLibrary.Asset): Promise<string | null> {
  if (videoThumbnailCache.has(asset.id)) {
    return videoThumbnailCache.get(asset.id) ?? null;
  }

  const pending = videoThumbnailTasks.get(asset.id);
  if (pending) {
    return pending;
  }

  const task = (async () => {
    try {
      const thumb = await getVideoThumbnailUri(asset.uri, 360);
      videoThumbnailCache.set(asset.id, thumb);
      return thumb;
    } catch (error) {
      if (__DEV__) {
        logMove('Thumbnail generation failed', {
          assetId: asset.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      videoThumbnailCache.set(asset.id, null);
      return null;
    } finally {
      videoThumbnailTasks.delete(asset.id);
    }
  })();

  videoThumbnailTasks.set(asset.id, task);
  return task;
}

function VideoTileThumbnail({ asset }: { asset: MediaLibrary.Asset }) {
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(
    videoThumbnailCache.get(asset.id) ?? null
  );

  useEffect(() => {
    let active = true;

    if (videoThumbnailCache.has(asset.id)) {
      setThumbnailUri(videoThumbnailCache.get(asset.id) ?? null);
      return () => {
        active = false;
      };
    }

    void loadVideoThumbnail(asset).then((thumb) => {
      if (active) {
        setThumbnailUri(thumb);
      }
    });

    return () => {
      active = false;
    };
  }, [asset]);

  if (thumbnailUri) {
    return <Image source={{ uri: thumbnailUri }} style={styles.thumb} />;
  }

  return (
    <LinearGradient
      colors={['rgba(239,207,156,0.14)', 'rgba(21,17,15,0.95)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.thumb}>
      <View style={styles.videoFallbackBubble}>
        <FontAwesome name="film" size={18} color={vaultTheme.bgDeep} />
      </View>
    </LinearGradient>
  );
}

function VideoPreviewCard({ asset }: { asset: MediaLibrary.Asset }) {
  const player = useVideoPlayer({ uri: asset.uri }, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = true;
    videoPlayer.play();
  });

  return (
    <View style={styles.previewShell}>
      <View style={styles.previewFrame}>
        <VideoView
          style={styles.previewVideo}
          player={player}
          nativeControls={false}
          contentFit="cover"
          fullscreenOptions={{ enable: false }}
          allowsPictureInPicture={false}
        />
        <LinearGradient
          colors={['rgba(7,6,6,0.05)', 'rgba(7,6,6,0.82)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.previewOverlay}>
          <View style={styles.previewPill}>
            <FontAwesome name="play" size={11} color={vaultTheme.bgDeep} />
            <Text style={styles.previewPillText}>Live preview</Text>
          </View>
          <Text numberOfLines={1} style={styles.previewTitle}>
            {asset.filename}
          </Text>
          <Text style={styles.previewMeta}>
            {formatDuration(asset.duration)} • {asset.width} × {asset.height}
          </Text>
        </LinearGradient>
      </View>
    </View>
  );
}

export default function GalleryMoveScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { suppressBackgroundLock } = useAuth();
  const params = useLocalSearchParams<{ media?: string | string[]; origin?: string | string[] }>();
  const rawMediaParam = Array.isArray(params.media) ? params.media[0] : params.media;
  const media = resolveMediaParam(params.media);
  const originTab = resolveOriginTab(params.origin);

  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moving, setMoving] = useState(false);
  const [endCursor, setEndCursor] = useState<string | undefined>();
  const [hasNextPage, setHasNextPage] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [previewAssetId, setPreviewAssetId] = useState<string | null>(null);
  const blockedRef = useRef(false);

  useEffect(() => {
    logMove('Screen mounted', {
      rawMediaParam,
      media,
      originTab,
    });
  }, [media, originTab, rawMediaParam]);

  const mediaType = media === 'video' ? MediaLibrary.MediaType.video : MediaLibrary.MediaType.photo;
  const granularPermission = media === 'video' ? 'video' : 'photo';
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const fallbackHref = originTab === 'video' ? '/video' : '/photos';
  const previewAsset = useMemo(
    () =>
      media === 'video'
        ? assets.find((asset) => asset.id === previewAssetId) ??
          assets.find((asset) => selectedSet.has(asset.id)) ??
          assets[0] ??
          null
        : null,
    [assets, media, previewAssetId, selectedSet]
  );

  const exitScreen = useCallback(() => {
    logMove('Exiting screen', { fallbackHref });
    router.replace(fallbackHref);
  }, [fallbackHref, router]);

  const showBlockingAlertAndExit = useCallback(
    (title: string, message: string) => {
      if (blockedRef.current) return;
      blockedRef.current = true;
      logMove('Blocking alert', { title, message });
      Alert.alert(title, message, [{ text: 'OK', onPress: exitScreen }], {
        cancelable: false,
      });
    },
    [exitScreen]
  );

  const loadPage = useCallback(
    async (cursor?: string) => {
      logMove('Loading gallery page', {
        cursor: cursor ?? null,
        mediaType,
        pageSize: PAGE_SIZE,
      });

      const page = await MediaLibrary.getAssetsAsync({
        first: PAGE_SIZE,
        after: cursor,
        mediaType,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });

      setAssets((prev) => (cursor ? [...prev, ...page.assets] : page.assets));
      setEndCursor(page.endCursor || undefined);
      setHasNextPage(page.hasNextPage);
      setTotalCount(page.totalCount);
      logMove('Loaded gallery page', {
        cursor: cursor ?? null,
        count: page.assets.length,
        totalCount: page.totalCount,
        hasNextPage: page.hasNextPage,
        endCursor: page.endCursor ?? null,
      });
    },
    [mediaType]
  );

  useEffect(() => {
    if (Platform.OS !== 'android') {
      showBlockingAlertAndExit('Android only', 'Move from gallery is only available on Android.');
      return;
    }

    if (rawMediaParam == null) {
      return;
    }

    if (!media) {
      showBlockingAlertAndExit('Invalid request', 'The gallery move screen was opened without a valid media type.');
      return;
    }

    let cancelled = false;

    const prepare = async () => {
      try {
        logMove('Requesting permissions', {
          granularPermission,
          media,
        });
        const releasePermissionLock = suppressBackgroundLock();
        const permission = await MediaLibrary.requestPermissionsAsync(false, [granularPermission]).finally(
          releasePermissionLock
        );
        if (cancelled) return;

        logMove('Permission result', permission);

        if (!permission.granted || permission.accessPrivileges !== 'all') {
          setLoadingInitial(false);
          showBlockingAlertAndExit(
            'Full access required',
            `Allow full ${media === 'video' ? 'Videos' : 'Photos'} access for AR Vault to move originals into the vault. Selected or limited access is not supported for move.`
          );
          return;
        }

        await loadPage();
      } catch (error) {
        logMove('Startup failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        if (!cancelled) {
          setLoadingInitial(false);
          showBlockingAlertAndExit(
            'Gallery unavailable',
            error instanceof Error ? error.message : 'Could not load your gallery.'
          );
          return;
        }
      }

      if (!cancelled) {
        setLoadingInitial(false);
      }
    };

    void prepare();

    return () => {
      cancelled = true;
    };
  }, [granularPermission, loadPage, media, rawMediaParam, showBlockingAlertAndExit, suppressBackgroundLock]);

  useEffect(() => {
    if (media !== 'video') return;

    if (!assets.length) {
      setPreviewAssetId(null);
      return;
    }

    if (previewAssetId && assets.some((asset) => asset.id === previewAssetId)) {
      return;
    }

    setPreviewAssetId(assets[0]?.id ?? null);
  }, [assets, media, previewAssetId]);

  const toggleSelected = useCallback((assetId: string) => {
    setSelectedIds((prev) =>
      prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId]
    );
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasNextPage || loadingMore || loadingInitial || moving || !endCursor) return;

    setLoadingMore(true);
    try {
      await loadPage(endCursor);
    } finally {
      setLoadingMore(false);
    }
  }, [endCursor, hasNextPage, loadPage, loadingInitial, loadingMore, moving]);

  const selectedAssets = useMemo<MediaStoreMoveAsset[]>(
    () =>
      assets
        .filter((asset) => selectedSet.has(asset.id))
        .map((asset) => ({
          id: asset.id,
          uri: asset.uri,
          filename: asset.filename,
          mediaType: asset.mediaType,
          width: asset.width,
          height: asset.height,
          duration: asset.duration,
        })),
    [assets, selectedSet]
  );

  const completeAndExit = useCallback(
    (title: string, message: string) => {
      Alert.alert(title, message, [{ text: 'OK', onPress: exitScreen }], {
        cancelable: false,
      });
    },
    [exitScreen]
  );

  const moveSelected = useCallback(async () => {
    if (!media || selectedAssets.length === 0 || moving) return;

    setMoving(true);
    try {
      logMove('Starting move', {
        media,
        selectedCount: selectedAssets.length,
      });

      const result = await moveMediaLibraryAssetsToVault({
        category: media,
        assets: selectedAssets,
        deleteAssets: async (assetIds) => {
          const releaseDeleteLock = suppressBackgroundLock();
          try {
            return await MediaLibrary.deleteAssetsAsync(assetIds);
          } finally {
            releaseDeleteLock();
          }
        },
      });

      logMove('Move result', result);

      if (result.importedCount > 0) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      if (result.importedCount === 0) {
        completeAndExit(
          'Move failed',
          `No ${media === 'video' ? 'videos' : 'photos'} were copied into your vault.`
        );
        return;
      }

      const lines = [
        `${pluralize(result.importedCount, media === 'video' ? 'video' : 'photo')} moved into your vault.`,
      ];

      if (result.copyFailedCount > 0) {
        lines.push(`${pluralize(result.copyFailedCount, 'item')} could not be copied.`);
      }

      if (result.deleteRequestedCount > 0 && !result.deleteSucceeded) {
        lines.push(
          `${result.deleteRequestedCount} imported item(s) could not be removed from the gallery. Delete those originals manually if you still want them gone.`
        );
        completeAndExit('Gallery copies may remain', lines.join(' '));
        return;
      }

      completeAndExit('Moved', lines.join(' '));
    } catch (error) {
      logMove('Move failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      completeAndExit(
        'Move failed',
        error instanceof Error ? error.message : 'Could not move the selected items.'
      );
    } finally {
      setMoving(false);
    }
  }, [completeAndExit, media, moving, selectedAssets, suppressBackgroundLock]);

  const renderItem = useCallback(
    ({ item }: { item: MediaLibrary.Asset }) => {
      const selected = selectedSet.has(item.id);
      const previewing = media === 'video' && previewAsset?.id === item.id;

      return (
        <Pressable
          disabled={moving}
          onPress={() => {
            if (media === 'video') {
              setPreviewAssetId(item.id);
            }
            toggleSelected(item.id);
          }}
          style={({ pressed }) => [
            styles.cellWrap,
            { width: CELL },
            pressed && !moving && { opacity: 0.92 },
          ]}>
          {media === 'photo' ? (
            <Image source={{ uri: item.uri }} style={styles.thumb} />
          ) : (
            <View style={styles.videoThumbFrame}>
              <VideoTileThumbnail asset={item} />
              <LinearGradient
                colors={['rgba(8,7,7,0.02)', 'rgba(8,7,7,0.88)']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.videoThumbOverlay}>
                <View style={styles.videoTileTopRow}>
                  {previewing ? <Text style={styles.previewBadge}>Preview</Text> : <View />}
                  <View style={styles.videoPlayBubble}>
                    <FontAwesome name="play" size={14} color={vaultTheme.bgDeep} />
                  </View>
                </View>
                <View>
                  <Text numberOfLines={2} style={styles.videoName}>
                    {item.filename}
                  </Text>
                  <Text style={styles.videoMeta}>{formatDuration(item.duration)}</Text>
                </View>
              </LinearGradient>
            </View>
          )}

          <View style={[styles.thumbBorder, selected && styles.thumbBorderSelected]} />
          <View style={[styles.badge, selected ? styles.badgeSelected : styles.badgeIdle]}>
            <FontAwesome name={selected ? 'check' : 'plus'} size={11} color="#fff" />
          </View>
        </Pressable>
      );
    },
    [media, moving, previewAsset?.id, selectedSet, toggleSelected]
  );

  const listHeader = useMemo(
    () => (
      <View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Selection summary</Text>
          <Text style={styles.summaryBody}>
            Choose the {media === 'video' ? 'videos' : 'photos'} you want AR Vault to copy into the
            vault, then Android will be asked to remove those exact gallery items.
          </Text>
          <View style={styles.summaryStats}>
            <Text style={styles.summaryStat}>{selectedIds.length} selected</Text>
            <Text style={styles.summaryDivider}>•</Text>
            <Text style={styles.summaryStat}>{totalCount} in gallery</Text>
          </View>
        </View>

        {media === 'video' && previewAsset ? (
          <View>
            <VideoPreviewCard key={previewAsset.id} asset={previewAsset} />
            <Text style={styles.previewHint}>
              Tap any clip below to update the preview, then choose the videos you want to move into
              AR Vault.
            </Text>
          </View>
        ) : null}
      </View>
    ),
    [media, previewAsset, selectedIds.length, totalCount]
  );

  if (loadingInitial) {
    return (
      <VaultLuxuryBackground>
        <View style={[styles.centerState, { paddingTop: insets.top + 10 }]}>
          <View style={styles.topBar}>
            <Pressable onPress={exitScreen} hitSlop={12} style={styles.topBarBack}>
              <FontAwesome name="arrow-left" size={24} color={vaultTheme.champagne} />
            </Pressable>
            <View style={styles.topBarCopy}>
              <Text style={styles.topBarEyebrow}>AR Vault</Text>
              <Text style={styles.topBarTitle}>{media === 'video' ? 'Move Videos' : 'Move Photos'}</Text>
            </View>
          </View>
          <ActivityIndicator size="large" color={vaultTheme.gold} />
          <Text style={styles.centerText}>Loading your recent {media === 'video' ? 'videos' : 'photos'}…</Text>
        </View>
      </VaultLuxuryBackground>
    );
  }

  return (
    <VaultLuxuryBackground>
      <View style={[styles.container, { paddingTop: insets.top + 10 }]}>
        <View style={styles.topBar}>
          <Pressable onPress={exitScreen} hitSlop={12} style={styles.topBarBack}>
            <FontAwesome name="arrow-left" size={24} color={vaultTheme.champagne} />
          </Pressable>
          <View style={styles.topBarCopy}>
            <Text style={styles.topBarEyebrow}>AR Vault</Text>
            <Text style={styles.topBarTitle}>{media === 'video' ? 'Move Videos' : 'Move Photos'}</Text>
          </View>
        </View>

        <FlatList
          data={assets}
          keyExtractor={(item) => item.id}
          numColumns={COLS}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={styles.row}
          ListHeaderComponent={listHeader}
          showsVerticalScrollIndicator={false}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.65}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <FontAwesome
                name={media === 'video' ? 'film' : 'picture-o'}
                size={42}
                color={vaultTheme.textMuted}
              />
              <Text style={styles.emptyText}>
                No {media === 'video' ? 'videos' : 'photos'} were found in the public gallery.
              </Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoading}>
                <ActivityIndicator color={vaultTheme.gold} />
              </View>
            ) : null
          }
        />

        <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 18) }]}>
          <Pressable
            disabled={moving}
            onPress={exitScreen}
            style={({ pressed }) => [
              styles.actionSecondary,
              pressed && !moving && { opacity: 0.92 },
              moving && styles.actionDisabled,
            ]}>
            <Text style={styles.actionSecondaryText}>Cancel</Text>
          </Pressable>
          <Pressable
            disabled={moving || selectedIds.length === 0}
            onPress={() => void moveSelected()}
            style={({ pressed }) => [
              styles.actionPrimary,
              pressed && selectedIds.length > 0 && !moving && { opacity: 0.94 },
              (moving || selectedIds.length === 0) && styles.actionDisabled,
            ]}>
            {moving ? (
              <ActivityIndicator color={vaultTheme.bgDeep} />
            ) : (
              <Text style={styles.actionPrimaryText}>
                Move {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </VaultLuxuryBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: GRID_PAD,
    marginBottom: 12,
  },
  topBarBack: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
  },
  topBarCopy: {
    flex: 1,
  },
  topBarEyebrow: {
    color: vaultTheme.goldMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  topBarTitle: {
    marginTop: 4,
    color: vaultTheme.textPrimary,
    fontSize: 28,
    fontWeight: '900',
  },
  centerState: {
    flex: 1,
    gap: 14,
    paddingHorizontal: 24,
  },
  centerText: {
    color: vaultTheme.textSecondary,
    fontSize: 15,
    textAlign: 'center',
  },
  summaryCard: {
    marginHorizontal: GRID_PAD,
    marginBottom: 12,
    padding: 18,
    gap: 8,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
    backgroundColor: vaultTheme.bgSurface,
  },
  summaryTitle: {
    color: vaultTheme.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  summaryBody: {
    color: vaultTheme.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  summaryStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryStat: {
    color: vaultTheme.goldMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  summaryDivider: {
    color: vaultTheme.textMuted,
    fontSize: 12,
  },
  listContent: {
    paddingBottom: 20,
  },
  previewShell: {
    marginHorizontal: GRID_PAD,
    marginBottom: 8,
  },
  previewFrame: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
    backgroundColor: vaultTheme.bgCard,
  },
  previewVideo: {
    width: '100%',
    height: 228,
    backgroundColor: '#000',
  },
  previewOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    gap: 6,
  },
  previewPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: vaultTheme.gold,
  },
  previewPillText: {
    color: vaultTheme.bgDeep,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  previewTitle: {
    color: vaultTheme.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  previewMeta: {
    color: vaultTheme.textSecondary,
    fontSize: 13,
  },
  previewHint: {
    marginHorizontal: GRID_PAD,
    marginBottom: 10,
    color: vaultTheme.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: GAP,
    paddingHorizontal: GRID_PAD,
  },
  cellWrap: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
  },
  thumb: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: vaultTheme.bgElevated,
  },
  videoThumbFrame: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: vaultTheme.bgElevated,
  },
  videoThumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: 10,
  },
  videoTileTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  previewBadge: {
    color: vaultTheme.gold,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    backgroundColor: 'rgba(9,7,6,0.52)',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
  },
  videoPlayBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: vaultTheme.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoFallbackBubble: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: vaultTheme.gold,
    alignSelf: 'center',
    marginTop: 28,
  },
  videoName: {
    color: vaultTheme.textPrimary,
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
  },
  videoMeta: {
    color: vaultTheme.goldMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textAlign: 'center',
    marginTop: 4,
  },
  thumbBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
  },
  thumbBorderSelected: {
    borderWidth: 2,
    borderColor: vaultTheme.gold,
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeIdle: {
    backgroundColor: 'rgba(18,14,28,0.72)',
  },
  badgeSelected: {
    backgroundColor: vaultTheme.gold,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 48,
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyText: {
    color: vaultTheme.textSecondary,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
  footerLoading: {
    paddingVertical: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: GRID_PAD,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: vaultTheme.borderSubtle,
    backgroundColor: 'rgba(10,6,18,0.94)',
  },
  actionPrimary: {
    flex: 1,
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: vaultTheme.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPrimaryText: {
    color: vaultTheme.bgDeep,
    fontSize: 15,
    fontWeight: '800',
  },
  actionSecondary: {
    width: 112,
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: vaultTheme.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: vaultTheme.bgCard,
  },
  actionSecondaryText: {
    color: vaultTheme.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  actionDisabled: {
    opacity: 0.55,
  },
});
