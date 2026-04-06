import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { vaultTheme } from '@/constants/vaultTheme';

type Props = { children: React.ReactNode; variant?: 'main' | 'auth' };

export function VaultLuxuryBackground({ children, variant = 'main' }: Props) {
  const colors =
    variant === 'auth'
      ? ([...vaultTheme.gradientLock] as [string, string, ...string[]])
      : ([...vaultTheme.gradientHero] as [string, string, ...string[]]);

  return (
    <LinearGradient colors={colors} locations={[0, 0.55, 1]} style={styles.flex}>
      <View style={[styles.glow, styles.topGlow]} pointerEvents="none" />
      <View style={[styles.glow, styles.bottomGlow]} pointerEvents="none" />
      <View style={styles.vignette} pointerEvents="none" />
      <View style={styles.texture} pointerEvents="none" />
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  glow: {
    position: 'absolute',
    borderRadius: 240,
  },
  topGlow: {
    top: -120,
    right: -40,
    width: 260,
    height: 260,
    backgroundColor: vaultTheme.glowSoft,
  },
  bottomGlow: {
    bottom: -140,
    left: -60,
    width: 280,
    height: 280,
    backgroundColor: vaultTheme.glowRose,
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.14)',
  },
  texture: {
    ...StyleSheet.absoluteFillObject,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.02)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.02)',
  },
});
