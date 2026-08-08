import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { createVideoPlayer, type VideoThumbnail } from 'expo-video';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { vaultTheme } from '@/constants/vaultTheme';
import { absoluteFilePath } from '@/lib/vaultStore';
import type { VaultItem } from '@/types/vault';

const thumbnailCache = new Map<string, VideoThumbnail | null>();
const thumbnailTasks = new Map<string, Promise<VideoThumbnail | null>>();

export function clearVaultVideoThumb(cacheKey: string) {
  thumbnailCache.delete(cacheKey);
}

async function loadVaultVideoThumbnail(uri: string, cacheKey: string): Promise<VideoThumbnail | null> {
  if (thumbnailCache.has(cacheKey)) {
    return thumbnailCache.get(cacheKey) ?? null;
  }

  const pending = thumbnailTasks.get(cacheKey);
  if (pending) return pending;

  const task = (async () => {
    const player = createVideoPlayer({ uri });
    try {
      const thumbs = await player.generateThumbnailsAsync(0.2, { maxWidth: 360 });
      const thumb = thumbs[0] ?? null;
      thumbnailCache.set(cacheKey, thumb);
      return thumb;
    } catch {
      thumbnailCache.set(cacheKey, null);
      return null;
    } finally {
      thumbnailTasks.delete(cacheKey);
      player.release();
    }
  })();

  thumbnailTasks.set(cacheKey, task);
  return task;
}

type Props = {
  item: VaultItem;
  style?: StyleProp<ViewStyle>;
};

export function VaultVideoThumb({ item, style }: Props) {
  const uri = absoluteFilePath(item.fileName);
  const [thumbnail, setThumbnail] = useState<VideoThumbnail | null>(
    () => thumbnailCache.get(item.id) ?? null
  );

  useEffect(() => {
    let active = true;
    if (thumbnailCache.has(item.id)) {
      setThumbnail(thumbnailCache.get(item.id) ?? null);
      return () => {
        active = false;
      };
    }
    void loadVaultVideoThumbnail(uri, item.id).then((thumb) => {
      if (active) setThumbnail(thumb);
    });
    return () => {
      active = false;
    };
  }, [item.id, uri]);

  return (
    <View style={[styles.fill, style]}>
      {thumbnail ? (
        <Image source={thumbnail} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} />
      ) : (
        <LinearGradient
          colors={['rgba(239,207,156,0.14)', 'rgba(21,17,15,0.95)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}>
          <View style={styles.fallbackBubble}>
            <FontAwesome name="film" size={18} color={vaultTheme.bgDeep} />
          </View>
        </LinearGradient>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    width: '100%',
    height: '100%',
    backgroundColor: vaultTheme.bgElevated,
  },
  fallbackBubble: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
