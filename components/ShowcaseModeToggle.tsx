import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { vaultTheme } from '@/constants/vaultTheme';
import type { ShowcaseMode } from '@/lib/vaultPrefs';

type Props = {
  mode: ShowcaseMode;
  onChange: (mode: ShowcaseMode) => void;
};

export function ShowcaseModeToggle({ mode, onChange }: Props) {
  return (
    <View style={styles.wrap} accessibilityRole="tablist">
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: mode === 'icons' }}
        accessibilityLabel="Icons view"
        hitSlop={6}
        onPress={() => {
          if (mode === 'icons') return;
          onChange('icons');
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        style={[styles.btn, mode === 'icons' && styles.btnActive]}>
        <FontAwesome
          name="th-large"
          size={15}
          color={mode === 'icons' ? vaultTheme.bgDeep : vaultTheme.gold}
        />
      </Pressable>
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: mode === 'list' }}
        accessibilityLabel="List view"
        hitSlop={6}
        onPress={() => {
          if (mode === 'list') return;
          onChange('list');
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        style={[styles.btn, mode === 'list' && styles.btnActive]}>
        <FontAwesome
          name="list"
          size={15}
          color={mode === 'list' ? vaultTheme.bgDeep : vaultTheme.gold}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: vaultTheme.borderStrong,
    backgroundColor: vaultTheme.bgGlass,
    overflow: 'hidden',
    marginRight: 6,
  },
  btn: {
    width: 34,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnActive: {
    backgroundColor: vaultTheme.gold,
  },
});
