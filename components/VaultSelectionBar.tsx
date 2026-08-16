import FontAwesome from '@expo/vector-icons/FontAwesome';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { vaultTheme } from '@/constants/vaultTheme';

type Props = {
  selectedCount: number;
  visibleCount: number;
  allSelected: boolean;
  busy?: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onShare: () => void;
  onRelease: () => void;
  onCancel: () => void;
  noun: 'photo' | 'video';
};

export function VaultSelectionBar({
  selectedCount,
  visibleCount,
  allSelected,
  busy = false,
  onSelectAll,
  onClear,
  onShare,
  onRelease,
  onCancel,
  noun,
}: Props) {
  const label =
    selectedCount === 0
      ? `Select ${noun}s`
      : `${selectedCount} ${noun}${selectedCount === 1 ? '' : 's'} selected`;
  const canAct = selectedCount > 0 && !busy;

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <Text style={styles.count}>{label}</Text>
        <View style={styles.topActions}>
          {visibleCount > 0 ? (
            <Pressable
              onPress={allSelected ? onClear : onSelectAll}
              disabled={busy}
              hitSlop={8}
              style={styles.textBtn}>
              <Text style={styles.textBtnLabel}>{allSelected ? 'Clear' : 'Select all'}</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={onCancel} disabled={busy} hitSlop={8} style={styles.textBtn}>
            <Text style={styles.cancelLabel}>Done</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          style={[styles.action, !canAct && styles.actionDisabled]}
          onPress={onShare}
          disabled={!canAct}
          accessibilityLabel="Share selected">
          {busy ? (
            <ActivityIndicator color={vaultTheme.bgDeep} size="small" />
          ) : (
            <FontAwesome name="share-square-o" size={16} color={vaultTheme.bgDeep} />
          )}
          <Text style={styles.actionText}>Share</Text>
        </Pressable>
        <Pressable
          style={[styles.action, styles.actionSecondary, !canAct && styles.actionDisabled]}
          onPress={onRelease}
          disabled={!canAct}
          accessibilityLabel="Move selected to gallery">
          <FontAwesome name="picture-o" size={15} color={vaultTheme.champagne} />
          <Text style={styles.actionSecondaryText}>To gallery</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: vaultTheme.borderSubtle,
    backgroundColor: vaultTheme.bgSurface,
    gap: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  count: {
    flex: 1,
    color: vaultTheme.champagne,
    fontWeight: '800',
    fontSize: 14,
  },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  textBtn: { paddingVertical: 6, paddingHorizontal: 8 },
  textBtnLabel: { color: vaultTheme.gold, fontWeight: '800', fontSize: 13 },
  cancelLabel: { color: vaultTheme.textSecondary, fontWeight: '700', fontSize: 13 },
  actions: { flexDirection: 'row', gap: 10 },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: vaultTheme.gold,
  },
  actionSecondary: {
    backgroundColor: vaultTheme.bgElevated,
    borderWidth: 1,
    borderColor: vaultTheme.borderStrong,
  },
  actionDisabled: { opacity: 0.45 },
  actionText: { color: vaultTheme.bgDeep, fontWeight: '800', fontSize: 14 },
  actionSecondaryText: { color: vaultTheme.champagne, fontWeight: '800', fontSize: 14 },
});
