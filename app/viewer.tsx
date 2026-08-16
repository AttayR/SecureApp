import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useNavigation } from '@react-navigation/native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { VideoView, useVideoPlayer } from 'expo-video';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';

import { VaultLuxuryBackground } from '@/components/VaultLuxuryBackground';
import { vaultTheme } from '@/constants/vaultTheme';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_RESTORE_FOLDER, vaultItemHasOriginalLocation } from '@/lib/galleryVault';
import { confirm, pickRestorePlace, toast } from '@/lib/notify';
import { releaseVaultItemsToGallery } from '@/lib/vaultMediaActions';
import { absoluteFilePath, deleteItem, loadItems } from '@/lib/vaultStore';
import type { VaultItem } from '@/types/vault';

function VaultVideoPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    // Avoid fighting other audio / codec sessions on open.
    p.muted = false;
  });

  useEffect(() => {
    const statusSub = player.addListener('statusChange', ({ status, error }) => {
      if (status === 'error') {
        toast.error('Playback error', error?.message ?? 'This video could not be played on this device.');
      }
    });
    // Start after the native view attaches — immediate play() can crash some Android devices.
    const start = setTimeout(() => {
      try {
        player.play();
      } catch {
        /* ignore */
      }
    }, 120);
    return () => {
      clearTimeout(start);
      statusSub.remove();
      try {
        player.pause();
      } catch {
        /* ignore */
      }
    };
  }, [player]);

  return (
    <VideoView
      style={styles.video}
      player={player}
      nativeControls
      contentFit="contain"
      // SurfaceView + overlapping chrome crashes on many physical Android devices.
      surfaceType={Platform.OS === 'android' ? 'textureView' : undefined}
      allowsPictureInPicture={false}
      fullscreenOptions={{ enable: true }}
    />
  );
}

function VaultVideoSection({ uri }: { uri: string }) {
  const [phase, setPhase] = useState<'checking' | 'ready' | 'missing' | 'error'>('checking');

  useEffect(() => {
    let cancelled = false;
    setPhase('checking');
    (async () => {
      try {
        // Give grid thumbnail ExoPlayers a moment to release before we open playback.
        await new Promise((r) => setTimeout(r, 180));
        if (cancelled) return;
        const info = await FileSystem.getInfoAsync(uri);
        if (cancelled) return;
        if (!info.exists || info.isDirectory) {
          setPhase('missing');
          return;
        }
        setPhase('ready');
      } catch {
        if (!cancelled) setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uri]);

  if (phase === 'checking') {
    return (
      <View style={styles.videoLoading}>
        <ActivityIndicator size="large" color={vaultTheme.gold} />
        <Text style={styles.videoLoadingText}>Opening video…</Text>
      </View>
    );
  }

  if (phase === 'missing') {
    return (
      <View style={styles.videoLoading}>
        <Text style={styles.videoLoadingText}>Video file is missing from the vault.</Text>
      </View>
    );
  }

  if (phase === 'error') {
    return (
      <View style={styles.videoLoading}>
        <Text style={styles.videoLoadingText}>Could not open this video.</Text>
      </View>
    );
  }

  return <VaultVideoPlayer key={uri} uri={uri} />;
}

function VaultAudioSection({ uri }: { uri: string }) {
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);
  const toggle = () => {
    if (status.playing) player.pause();
    else player.play();
  };
  return (
    <View style={styles.audioBox}>
      <View style={styles.audioIconWrap}>
        <FontAwesome name="music" size={36} color={vaultTheme.gold} />
      </View>
      <Text style={styles.audioLabel}>Private audio</Text>
      <Pressable style={styles.playBtn} onPress={toggle}>
        <LinearGradient
          colors={[...vaultTheme.gradientGold] as [string, string]}
          style={styles.playGrad}>
          <Text style={styles.playBtnText}>{status.playing ? 'Pause' : 'Play'}</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

function PhotoPage({
  item,
  width,
  height,
}: {
  item: VaultItem;
  width: number;
  height: number;
}) {
  const uri = absoluteFilePath(item.fileName);
  // Explicit pixel size + recyclingKey avoids Android FlatList blank pages after swipe.
  return (
    <View style={{ width, height, backgroundColor: '#000' }}>
      <Image
        source={{ uri }}
        style={{ width, height }}
        contentFit="contain"
        recyclingKey={item.id}
        transition={0}
        cachePolicy="memory-disk"
        accessibilityLabel={item.name}
      />
    </View>
  );
}

export default function ViewerScreen() {
  const { id: routeId } = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(routeId) ? routeId[0] : routeId;
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { suppressBackgroundLock } = useAuth();
  const [siblings, setSiblings] = useState<VaultItem[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [busy, setBusy] = useState(false);
  const listRef = useRef<FlatList<VaultItem>>(null);
  const indexRef = useRef(0);
  const siblingsRef = useRef<VaultItem[]>([]);
  const busyRef = useRef(false);
  const syncingParamsRef = useRef(false);
  const alertOpenRef = useRef(false);
  const didInitialScrollRef = useRef(false);
  const pageWidth = stageSize.width > 0 ? stageSize.width : windowWidth;

  const item = siblings[index] ?? null;
  const uri = item ? absoluteFilePath(item.fileName) : '';
  const canSwipe = item?.category === 'photo' && siblings.length > 1 && !busy;

  useEffect(() => {
    siblingsRef.current = siblings;
  }, [siblings]);

  const exitScreen = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    const category = item?.category ?? siblingsRef.current[0]?.category;
    if (category === 'photo') {
      router.replace('/photos');
      return;
    }
    if (category === 'video') {
      router.replace('/video');
      return;
    }
    if (category === 'audio') {
      router.replace('/audio');
      return;
    }
    if (category === 'document') {
      router.replace('/documents');
      return;
    }
    router.replace('/');
  }, [item?.category, router]);

  const syncRouteId = useCallback(
    (nextId: string) => {
      if (!nextId || nextId === id) return;
      syncingParamsRef.current = true;
      router.setParams({ id: nextId });
      // Keep the flag long enough to cover the param-driven effect on Android.
      setTimeout(() => {
        syncingParamsRef.current = false;
      }, 250);
    },
    [id, router]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) {
        setLoading(false);
        return;
      }

      // Local swipe already updated siblings — just align index if needed.
      if (syncingParamsRef.current || siblingsRef.current.some((s) => s.id === id)) {
        const idx = siblingsRef.current.findIndex((s) => s.id === id);
        if (idx >= 0 && idx !== indexRef.current) {
          indexRef.current = idx;
          setIndex(idx);
        }
        setLoading(false);
        return;
      }

      const all = await loadItems();
      const found = all.find((x) => x.id === id) ?? null;
      if (cancelled) return;

      if (!found) {
        setSiblings([]);
        setIndex(0);
        indexRef.current = 0;
        didInitialScrollRef.current = false;
      } else {
        const group = all.filter((x) => x.category === found.category);
        const start = Math.max(0, group.findIndex((x) => x.id === found.id));
        setSiblings(group);
        setIndex(start);
        indexRef.current = start;
        didInitialScrollRef.current = false;
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useLayoutEffect(() => {
    const title = item?.name ?? 'Preview';
    const showCounter = item?.category === 'photo' && siblings.length > 1;
    const counter = showCounter ? `${index + 1} / ${siblings.length}` : null;

    navigation.setOptions({
      headerTitleAlign: 'center',
      headerShadowVisible: false,
      headerBackVisible: false,
      headerLeft: () => (
        <Pressable
          style={styles.headerBackBtn}
          onPress={exitScreen}
          hitSlop={12}
          disabled={busy}
          accessibilityLabel="Go back">
          <FontAwesome name="chevron-left" size={18} color={vaultTheme.champagne} />
        </Pressable>
      ),
      headerTitle: () => (
        <View style={styles.headerTitleBlock}>
          {counter ? (
            <Text style={styles.headerCounter} accessibilityLabel={`Photo ${counter}`}>
              {counter}
            </Text>
          ) : null}
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
        </View>
      ),
      headerRight: () => <View style={styles.headerRightSpacer} />,
    });
  }, [busy, exitScreen, index, item?.name, item?.category, navigation, siblings.length]);

  const selectIndex = useCallback(
    (next: number, opts?: { animated?: boolean; syncRoute?: boolean }) => {
      if (next < 0 || next >= siblingsRef.current.length) return;
      if (next === indexRef.current && opts?.syncRoute !== true) return;
      indexRef.current = next;
      setIndex(next);
      const nextItem = siblingsRef.current[next];
      // Avoid syncing route on every swipe — setParams remount churn blanks Android pages.
      if (opts?.syncRoute === true && nextItem) {
        syncRouteId(nextItem.id);
      }
      if (opts?.animated !== false) {
        void Haptics.selectionAsync();
      }
    },
    [syncRouteId]
  );

  const goToIndex = useCallback(
    (next: number, animated = true) => {
      if (busyRef.current || alertOpenRef.current) return;
      if (next < 0 || next >= siblingsRef.current.length || next === indexRef.current) return;
      listRef.current?.scrollToOffset({ offset: next * pageWidth, animated });
      selectIndex(next, { animated });
    },
    [pageWidth, selectIndex]
  );

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (busyRef.current || alertOpenRef.current || pageWidth <= 0) return;
      const next = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
      if (next === indexRef.current || next < 0 || next >= siblingsRef.current.length) return;
      selectIndex(next);
    },
    [pageWidth, selectIndex]
  );

  // Android: initialScrollIndex often renders a blank page — scroll after layout instead.
  useEffect(() => {
    if (didInitialScrollRef.current) return;
    if (loading || stageSize.width <= 0 || siblings.length === 0) return;
    const start = Math.min(indexRef.current, siblings.length - 1);
    didInitialScrollRef.current = true;
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: start * stageSize.width, animated: false });
    });
  }, [loading, siblings.length, stageSize.width]);

  const removeCurrentFromPager = useCallback(
    (removedId: string) => {
      const remaining = siblingsRef.current.filter((s) => s.id !== removedId);
      if (remaining.length === 0) {
        exitScreen();
        return;
      }
      const nextIndex = Math.min(indexRef.current, remaining.length - 1);
      setSiblings(remaining);
      siblingsRef.current = remaining;
      indexRef.current = nextIndex;
      setIndex(nextIndex);
      const nextItem = remaining[nextIndex];
      if (nextItem) syncRouteId(nextItem.id);
      requestAnimationFrame(() => {
        listRef.current?.scrollToOffset({
          offset: nextIndex * pageWidth,
          animated: false,
        });
      });
    },
    [exitScreen, pageWidth, syncRouteId]
  );

  const withBusy = useCallback(async (fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await fn();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const shareFile = () => {
    if (!item || busyRef.current) return;
    void withBusy(async () => {
      const can = await Sharing.isAvailableAsync();
      if (!can) {
        toast.warning('Sharing unavailable', 'Sharing is not available on this device.');
        return;
      }
      const fileUri = absoluteFilePath(item.fileName);
      const releaseExternalFlow = suppressBackgroundLock();
      try {
        await Sharing.shareAsync(fileUri);
      } finally {
        releaseExternalFlow();
      }
    });
  };

  const confirmReleaseToGallery = () => {
    if (!item || item.category === 'document' || busyRef.current || alertOpenRef.current) return;
    const snapshot = item;
    alertOpenRef.current = true;
    void (async () => {
      const target = await pickRestorePlace({
        title: 'Move to gallery',
        message: `"${snapshot.name}" will be copied out of the vault.`,
        originalHint: vaultItemHasOriginalLocation(snapshot)
          ? snapshot.sourceAlbumName
            ? `Back to “${snapshot.sourceAlbumName}”.`
            : 'Back to the same album it was imported from.'
          : 'Original album wasn’t saved for this item. It will go to the default gallery.',
        folderDefault: DEFAULT_RESTORE_FOLDER,
      });
      alertOpenRef.current = false;
      if (!target) return;
      await withBusy(async () => {
        const releaseExternalFlow = suppressBackgroundLock();
        try {
          const result = await releaseVaultItemsToGallery([snapshot], target);
          if (result.permissionDenied) {
            toast.warning(
              'Could not release',
              'Allow library access so AR Vault can add this file back to your gallery.'
            );
            return;
          }
          if (result.released === 0) {
            toast.warning(
              'Could not release',
              'Allow library access so AR Vault can add this file back to your gallery.'
            );
            return;
          }
        } catch {
          toast.error(
            'Partially done',
            'A copy was added to your gallery, but the vault copy could not be removed. Delete it from the vault manually if needed.'
          );
          return;
        } finally {
          releaseExternalFlow();
        }
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        toast.success(
          'Released',
          target.mode === 'folder'
            ? `Saved in “${target.folderName.trim() || DEFAULT_RESTORE_FOLDER}” and removed from vault.`
            : 'Copied to gallery and removed from vault.'
        );
        removeCurrentFromPager(snapshot.id);
      });
    })();
  };

  const confirmDeleteFromVault = () => {
    if (!item || busyRef.current || alertOpenRef.current) return;
    const target = { id: item.id, name: item.name };
    alertOpenRef.current = true;
    void (async () => {
      const ok = await confirm({
        title: 'Delete from vault?',
        message: `"${target.name}" will be permanently deleted from the vault. It will not be added to your gallery.`,
        confirmLabel: 'Delete',
        destructive: true,
      });
      alertOpenRef.current = false;
      if (!ok) return;
      await withBusy(async () => {
        try {
          const current = siblingsRef.current.find((s) => s.id === target.id);
          if (!current) {
            toast.info('Already removed', 'This item is no longer in the vault.');
            return;
          }
          await deleteItem(current);
        } catch {
          toast.error('Could not delete', 'Something went wrong. Please try again.');
          return;
        }
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        toast.success('Deleted', 'Removed from vault.');
        removeCurrentFromPager(target.id);
      });
    })();
  };

  if (loading) {
    return (
      <VaultLuxuryBackground>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={vaultTheme.gold} />
        </View>
      </VaultLuxuryBackground>
    );
  }

  if (!item) {
    return (
      <VaultLuxuryBackground>
        <View style={styles.center}>
          <Text style={styles.muted}>Item not found.</Text>
          <Pressable style={styles.backBtn} onPress={exitScreen}>
            <Text style={styles.backBtnText}>Go back</Text>
          </Pressable>
        </View>
      </VaultLuxuryBackground>
    );
  }

  const showVaultActions = item.category !== 'document' && Platform.OS !== 'web';

  return (
    <VaultLuxuryBackground>
      <View style={styles.screen}>
        <View
          style={styles.stage}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            if (width <= 0 || height <= 0) return;
            setStageSize((prev) =>
              prev.width === width && prev.height === height ? prev : { width, height }
            );
          }}>
          {item.category === 'photo' && stageSize.width > 0 && stageSize.height > 0 ? (
            <FlatList
              ref={listRef}
              style={styles.pager}
              data={siblings}
              keyExtractor={(photo) => photo.id}
              horizontal
              pagingEnabled
              scrollEnabled={!busy}
              decelerationRate="fast"
              showsHorizontalScrollIndicator={false}
              bounces={siblings.length > 1}
              getItemLayout={(_, i) => ({
                length: pageWidth,
                offset: pageWidth * i,
                index: i,
              })}
              renderItem={({ item: photo }) => (
                <PhotoPage
                  item={photo}
                  width={stageSize.width}
                  height={stageSize.height}
                />
              )}
              onMomentumScrollEnd={onMomentumScrollEnd}
              onScrollToIndexFailed={(info) => {
                listRef.current?.scrollToOffset({
                  offset: info.index * pageWidth,
                  animated: false,
                });
              }}
              windowSize={5}
              maxToRenderPerBatch={3}
              initialNumToRender={Math.min(siblings.length, 3)}
              // Android blanks pages when this is true on horizontal image pagers.
              removeClippedSubviews={false}
              extraData={`${stageSize.width}x${stageSize.height}:${index}`}
            />
          ) : null}

          {item.category === 'video' && Platform.OS !== 'web' ? (
            <VaultVideoSection key={uri} uri={uri} />
          ) : null}
          {item.category === 'video' && Platform.OS === 'web' ? (
            <Text style={styles.webFallback}>Video preview is not supported on web.</Text>
          ) : null}

          {item.category === 'audio' && Platform.OS !== 'web' ? (
            <VaultAudioSection key={uri} uri={uri} />
          ) : null}
          {item.category === 'audio' && Platform.OS === 'web' ? (
            <Text style={styles.webFallback}>Audio preview is not supported on web.</Text>
          ) : null}

          {item.category === 'document' ? (
            <View style={styles.docBox}>
              <View style={styles.docIconWrap}>
                <FontAwesome name="file-text-o" size={32} color={vaultTheme.gold} />
              </View>
              <Text style={styles.docTitle}>Document</Text>
              <Text style={styles.docMeta}>{item.mimeType ?? 'file'}</Text>
              <Pressable style={styles.shareBtn} onPress={shareFile} disabled={busy}>
                <Text style={styles.shareBtnText}>Share or open externally</Text>
              </Pressable>
            </View>
          ) : null}

          {canSwipe ? (
            <View style={styles.navHints} pointerEvents="box-none">
              <Pressable
                style={[styles.navChevron, index === 0 && styles.navChevronDisabled]}
                disabled={index === 0}
                onPress={() => goToIndex(index - 1)}
                hitSlop={8}
                accessibilityLabel="Previous photo">
                <FontAwesome
                  name="chevron-left"
                  size={16}
                  color={index === 0 ? vaultTheme.textMuted : vaultTheme.champagne}
                />
              </Pressable>
              <Pressable
                style={[
                  styles.navChevron,
                  index >= siblings.length - 1 && styles.navChevronDisabled,
                ]}
                disabled={index >= siblings.length - 1}
                onPress={() => goToIndex(index + 1)}
                hitSlop={8}
                accessibilityLabel="Next photo">
                <FontAwesome
                  name="chevron-right"
                  size={16}
                  color={
                    index >= siblings.length - 1 ? vaultTheme.textMuted : vaultTheme.champagne
                  }
                />
              </Pressable>
            </View>
          ) : null}

          {busy ? (
            <View style={styles.busyOverlay} pointerEvents="auto">
              <ActivityIndicator size="large" color={vaultTheme.gold} />
            </View>
          ) : null}
        </View>

        {showVaultActions ? (
          <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <LinearGradient
              colors={['transparent', 'rgba(9,7,6,0.92)', vaultTheme.bgDeep]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <Pressable
              style={({ pressed }) => [
                styles.actionPrimary,
                (pressed || busy) && styles.actionPressed,
              ]}
              onPress={confirmReleaseToGallery}
              disabled={busy}>
              <FontAwesome name="unlock-alt" size={16} color={vaultTheme.champagne} />
              <View style={styles.actionCopy}>
                <Text style={styles.actionPrimaryTitle}>Release to gallery</Text>
                <Text style={styles.actionSubtitle}>Copy out · remove from vault</Text>
              </View>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.actionSecondary,
                (pressed || busy) && styles.actionPressed,
              ]}
              onPress={shareFile}
              disabled={busy}>
              <FontAwesome name="share-square-o" size={16} color={vaultTheme.champagne} />
              <View style={styles.actionCopy}>
                <Text style={styles.actionSecondaryTitle}>Export / share</Text>
                <Text style={styles.actionSubtitle}>Keeps a private copy in vault</Text>
              </View>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.actionDanger,
                (pressed || busy) && styles.actionPressed,
              ]}
              onPress={confirmDeleteFromVault}
              disabled={busy}>
              <FontAwesome name="trash-o" size={16} color={vaultTheme.danger} />
              <View style={styles.actionCopy}>
                <Text style={styles.actionDangerTitle}>Delete from vault</Text>
                <Text style={styles.actionSubtitle}>Permanent · not added to gallery</Text>
              </View>
            </Pressable>
          </View>
        ) : null}
      </View>
    </VaultLuxuryBackground>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  headerBackBtn: {
    width: 36,
    height: 36,
    marginLeft: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRightSpacer: {
    width: 36,
    marginRight: 4,
  },
  headerTitleBlock: {
    maxWidth: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  headerCounter: {
    color: vaultTheme.goldMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  headerTitle: {
    color: vaultTheme.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  muted: { color: vaultTheme.textSecondary, fontSize: 16 },
  screen: {
    flex: 1,
  },
  stage: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  pager: {
    flex: 1,
  },
  video: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
  videoLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: '#000',
  },
  videoLoadingText: {
    color: vaultTheme.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  webFallback: {
    padding: 24,
    color: vaultTheme.textSecondary,
    textAlign: 'center',
  },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  navHints: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  navChevron: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(9,7,6,0.45)',
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
  },
  navChevronDisabled: {
    opacity: 0.35,
  },
  audioBox: {
    flex: 1,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  audioIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: vaultTheme.bgGlass,
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
  },
  audioLabel: { fontSize: 17, fontWeight: '700', color: vaultTheme.champagne },
  playBtn: { borderRadius: 14, overflow: 'hidden' },
  playGrad: { paddingVertical: 16, paddingHorizontal: 36 },
  playBtnText: { color: '#1a1208', fontWeight: '800', fontSize: 16 },
  docBox: {
    margin: 20,
    padding: 28,
    gap: 12,
    borderRadius: 20,
    backgroundColor: vaultTheme.bgElevated,
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
    alignItems: 'center',
  },
  docIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: vaultTheme.bgGlass,
    marginBottom: 4,
  },
  docTitle: { fontSize: 18, fontWeight: '700', color: vaultTheme.textPrimary },
  docMeta: { color: vaultTheme.textMuted, marginBottom: 8 },
  shareBtn: {
    marginTop: 8,
    alignSelf: 'stretch',
    backgroundColor: vaultTheme.success,
    padding: 16,
    borderRadius: 14,
  },
  shareBtnText: { color: '#0a1f12', fontWeight: '800', textAlign: 'center' },
  actionBar: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 8,
  },
  actionPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: vaultTheme.violetDeep,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: vaultTheme.borderStrong,
  },
  actionSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: vaultTheme.bgGlass,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: vaultTheme.borderStrong,
  },
  actionDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(222,113,109,0.1)',
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(222,113,109,0.35)',
  },
  actionPressed: {
    opacity: 0.7,
  },
  actionCopy: {
    flex: 1,
    gap: 2,
  },
  actionPrimaryTitle: {
    color: vaultTheme.champagne,
    fontWeight: '800',
    fontSize: 15,
  },
  actionSecondaryTitle: {
    color: vaultTheme.champagne,
    fontWeight: '700',
    fontSize: 15,
  },
  actionDangerTitle: {
    color: vaultTheme.danger,
    fontWeight: '700',
    fontSize: 15,
  },
  actionSubtitle: {
    color: vaultTheme.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  backBtn: { marginTop: 20, padding: 14 },
  backBtnText: { color: vaultTheme.gold, fontWeight: '700' },
});
