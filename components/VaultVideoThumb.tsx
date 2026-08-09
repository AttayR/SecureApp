import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { vaultTheme } from '@/constants/vaultTheme';
import type { VaultItem } from '@/types/vault';

/**
 * Intentionally does NOT call expo-video createVideoPlayer / generateThumbnailsAsync.
 * On many physical Android devices, creating ExoPlayer instances while opening the Video
 * tab (grid/list of vault files) hard-crashes the process. A static tile keeps the tab stable;
 * real playback stays in the viewer.
 */
export function clearVaultVideoThumb(_cacheKey: string) {
  /* no-op — kept for call-site compatibility */
}

type Props = {
  item: VaultItem;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
};

export function VaultVideoThumb({ item, style, compact = false }: Props) {
  return (
    <View style={[styles.fill, style]} accessibilityLabel={item.name}>
      <LinearGradient
        colors={['rgba(239,207,156,0.18)', 'rgba(34,25,22,0.98)', 'rgba(12,9,8,1)']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}>
        <View style={styles.glow} />
        <View style={styles.center}>
          <View style={[styles.bubble, compact && styles.bubbleCompact]}>
            <FontAwesome name="film" size={compact ? 14 : 20} color={vaultTheme.bgDeep} />
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    width: '100%',
    height: '100%',
    backgroundColor: vaultTheme.bgElevated,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    top: -20,
    right: -10,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: vaultTheme.glowSoft,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: vaultTheme.gold,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  bubbleCompact: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
});
