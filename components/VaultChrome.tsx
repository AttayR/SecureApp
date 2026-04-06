import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { vaultTheme } from '@/constants/vaultTheme';

export function VaultHeaderBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={[...vaultTheme.gradientHeader] as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.headerGlow, styles.headerGlowLeft]} />
      <View style={[styles.headerGlow, styles.headerGlowRight]} />
      <View style={styles.headerLine} />
    </View>
  );
}

export function VaultHeaderTitle({ title }: { title: string }) {
  return (
    <View style={styles.titleWrap}>
      <Text style={styles.eyebrow}>AR Vault</Text>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

export function VaultTabBarBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={[...vaultTheme.gradientTab] as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.tabLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  titleWrap: {
    gap: 1,
  },
  eyebrow: {
    color: vaultTheme.goldMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  title: {
    color: vaultTheme.textPrimary,
    fontSize: 19,
    fontWeight: '800',
  },
  headerGlow: {
    position: 'absolute',
    top: -18,
    width: 140,
    height: 96,
    borderRadius: 48,
    backgroundColor: vaultTheme.glowSoft,
  },
  headerGlowLeft: {
    left: -12,
  },
  headerGlowRight: {
    right: 24,
    width: 112,
    height: 84,
    backgroundColor: vaultTheme.glowRose,
  },
  headerLine: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 0,
    height: 1,
    backgroundColor: vaultTheme.borderSubtle,
  },
  tabLine: {
    position: 'absolute',
    left: 18,
    right: 18,
    top: 0,
    height: 1,
    backgroundColor: vaultTheme.borderSubtle,
  },
});
