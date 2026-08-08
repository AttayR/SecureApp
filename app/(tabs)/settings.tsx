import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';

import { VaultLuxuryBackground } from '@/components/VaultLuxuryBackground';
import { vaultTheme } from '@/constants/vaultTheme';
import { useAuth } from '@/contexts/AuthContext';
import {
  backupVaultToAndroidFolder,
  exportVaultToZipFile,
  importVaultFromZipPicker,
  restoreVaultFromAndroidFolder,
} from '@/lib/vaultBackup';
import { toast } from '@/lib/notify';
import { getHideGalleryAfterImport, setHideGalleryAfterImport } from '@/lib/vaultPrefs';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const {
    biometricAvailable,
    biometricEnabled,
    setBiometricEnabled,
    lockOnBackground,
    setLockOnBackground,
    lock,
    lastUnlockFormatted,
    suppressBackgroundLock,
  } = useAuth();

  const [hideGallery, setHideGallery] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void getHideGalleryAfterImport().then(setHideGallery);
  }, []);

  const toggleHideGallery = async (v: boolean) => {
    setHideGallery(v);
    await setHideGalleryAfterImport(v);
  };

  const runBackup = useCallback(async (kind: 'zip' | 'folder') => {
    setBusy(kind);
    try {
      if (kind === 'folder') {
        const releaseExternalFlow = suppressBackgroundLock();
        const r = await backupVaultToAndroidFolder().finally(releaseExternalFlow);
        if (r.ok) toast.success('Backup done', r.message);
        else toast.error('Backup', r.message);
      } else {
        const path = await exportVaultToZipFile();
        const can = await Sharing.isAvailableAsync();
        if (!can) {
          toast.warning(
            'Sharing unavailable',
            'ZIP created at cache path; use Android folder backup instead.'
          );
          return;
        }
        const releaseExternalFlow = suppressBackgroundLock();
        await Sharing.shareAsync(path).finally(releaseExternalFlow);
      }
    } catch (e) {
      toast.error('Backup failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(null);
    }
  }, [suppressBackgroundLock]);

  const runRestoreZip = useCallback(async () => {
    setBusy('restore');
    try {
      const releaseExternalFlow = suppressBackgroundLock();
      const r = await importVaultFromZipPicker().finally(releaseExternalFlow);
      if (r.ok) toast.success('Restored', r.message);
      else toast.error('Restore', r.message);
    } finally {
      setBusy(null);
    }
  }, [suppressBackgroundLock]);

  const runRestoreFolder = useCallback(async () => {
    setBusy('restore');
    try {
      const releaseExternalFlow = suppressBackgroundLock();
      const r = await restoreVaultFromAndroidFolder().finally(releaseExternalFlow);
      if (r.ok) toast.success('Restored', r.message);
      else toast.error('Restore', r.message);
    } finally {
      setBusy(null);
    }
  }, [suppressBackgroundLock]);

  return (
    <VaultLuxuryBackground>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 24 + Math.max(insets.bottom, 16) },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardKicker}>Security status</Text>
          <Text style={styles.cardBody}>
            {lastUnlockFormatted
              ? `Last unlocked: ${lastUnlockFormatted}`
              : 'Unlock once to record last access time.'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardKicker}>Gallery privacy</Text>
          <Text style={styles.cardBody}>
            When on, photos and videos you import are copied into the vault and the original is removed
            from the public gallery (needs full Photos permission). Turn off to keep a gallery copy.
            {Platform.OS === 'android'
              ? ' On Android 14+, open system Settings → Apps → AR Vault → Photos and videos and choose “Allow all” (not “Selected photos only”). If it keeps switching back to limited access, turn off “Remove permissions if app isn’t used” for this app and avoid battery restrictions that reset permissions.'
              : ''}
          </Text>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.label}>Remove originals from gallery</Text>
              <Text style={styles.sub}>After import, only the vault has the file</Text>
            </View>
            <Switch
              value={hideGallery}
              onValueChange={(v) => void toggleHideGallery(v)}
              trackColor={{ false: '#333', true: vaultTheme.violetDeep }}
              thumbColor={hideGallery ? vaultTheme.gold : '#888'}
            />
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.label}>Biometric unlock</Text>
              <Text style={styles.sub}>Fingerprint or face (optional)</Text>
            </View>
            <Switch
              value={biometricEnabled}
              onValueChange={(v) => void setBiometricEnabled(v)}
              disabled={!biometricAvailable}
              trackColor={{ false: '#333', true: vaultTheme.violetDeep }}
              thumbColor={biometricEnabled ? vaultTheme.gold : '#888'}
            />
          </View>
          {!biometricAvailable ? (
            <Text style={styles.warn}>Biometrics not available or not enrolled.</Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.label}>Lock when leaving app</Text>
              <Text style={styles.sub}>Background = locked (recommended)</Text>
            </View>
            <Switch
              value={lockOnBackground}
              onValueChange={(v) => void setLockOnBackground(v)}
              trackColor={{ false: '#333', true: vaultTheme.violetDeep }}
              thumbColor={lockOnBackground ? vaultTheme.gold : '#888'}
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardKicker}>Backup & recovery</Text>
          <Text style={styles.cardBody}>
            Android deletes this app&apos;s private data when you uninstall. To never lose files by
            accident, export a backup to a folder or ZIP you control (Drive, SD card, PC). After
            reinstall, restore from that backup.
          </Text>
          {busy ? (
            <View style={styles.busyRow}>
              <ActivityIndicator color={vaultTheme.gold} />
              <Text style={styles.busyText}>Working…</Text>
            </View>
          ) : null}
          {Platform.OS === 'android' ? (
            <Pressable
              style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.9 }]}
              disabled={!!busy}
              onPress={() => void runBackup('folder')}>
              <Text style={styles.actionBtnText}>Backup to folder (recommended)</Text>
              <Text style={styles.actionSub}>Large vaults · survives uninstall if folder is outside the app</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={({ pressed }) => [styles.actionBtnOutline, pressed && { opacity: 0.9 }]}
            disabled={!!busy}
            onPress={() => void runBackup('zip')}>
            <Text style={styles.actionBtnOutlineText}>Export backup ZIP (share…)</Text>
            <Text style={styles.actionSub}>Works on iOS &amp; Android · best under ~350 MB total</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.actionBtnOutline, pressed && { opacity: 0.9 }]}
            disabled={!!busy}
            onPress={() => void runRestoreZip()}>
            <Text style={styles.actionBtnOutlineText}>Restore from ZIP</Text>
          </Pressable>
          {Platform.OS === 'android' ? (
            <Pressable
              style={({ pressed }) => [styles.actionBtnOutline, pressed && { opacity: 0.9 }]}
              disabled={!!busy}
              onPress={() => void runRestoreFolder()}>
              <Text style={styles.actionBtnOutlineText}>Restore from folder (Android)</Text>
              <Text style={styles.actionSub}>Pick the ARVault_backup_* folder you created earlier</Text>
            </Pressable>
          ) : null}
        </View>

        <Pressable
          style={({ pressed }) => [styles.lockBtn, pressed && { opacity: 0.92 }]}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            lock();
          }}>
          <Text style={styles.lockBtnText}>Lock vault immediately</Text>
        </Pressable>

        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerTitle}>Storage & encryption</Text>
          <Text style={styles.disclaimerBody}>
            Vault files live in this app&apos;s private storage (hidden from other apps and from the
            gallery once originals are removed). Android may encrypt storage when your phone is locked.
            Backup ZIPs are ordinary files — store them somewhere safe if you need them after uninstall.
          </Text>
        </View>
      </ScrollView>
    </VaultLuxuryBackground>
  );
}

const styles = StyleSheet.create({
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, gap: 14 },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
    padding: 18,
    gap: 12,
    backgroundColor: vaultTheme.bgCard,
  },
  cardKicker: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: vaultTheme.goldMuted,
    textTransform: 'uppercase',
  },
  cardBody: { fontSize: 14, lineHeight: 21, color: vaultTheme.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowText: { flex: 1 },
  label: { fontSize: 16, fontWeight: '700', color: vaultTheme.textPrimary },
  sub: { fontSize: 13, color: vaultTheme.textMuted, marginTop: 4 },
  warn: { fontSize: 12, color: '#e3b341' },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 4 },
  busyText: { color: vaultTheme.textSecondary },
  actionBtn: {
    backgroundColor: vaultTheme.violetDeep,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: vaultTheme.borderStrong,
  },
  actionBtnText: { color: vaultTheme.champagne, fontWeight: '800', fontSize: 15 },
  actionBtnOutline: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: vaultTheme.borderStrong,
    backgroundColor: vaultTheme.bgGlass,
  },
  actionBtnOutlineText: { color: vaultTheme.champagne, fontWeight: '700', fontSize: 15 },
  actionSub: { fontSize: 12, color: vaultTheme.textMuted, marginTop: 6 },
  lockBtn: {
    backgroundColor: 'rgba(232,93,111,0.12)',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(232,93,111,0.45)',
  },
  lockBtnText: { color: vaultTheme.danger, fontWeight: '800', fontSize: 16 },
  disclaimer: { marginTop: 8, paddingVertical: 8 },
  disclaimerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: vaultTheme.champagne,
    marginBottom: 8,
  },
  disclaimerBody: { fontSize: 13, lineHeight: 21, color: vaultTheme.textMuted },
});
