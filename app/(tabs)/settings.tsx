import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

import { PinPromptModal } from '@/components/PinPromptModal';
import { VaultLuxuryBackground } from '@/components/VaultLuxuryBackground';
import { vaultTheme } from '@/constants/vaultTheme';
import { useAuth } from '@/contexts/AuthContext';
import {
  type AskBackupPin,
  backupVaultToAndroidFolder,
  exportVaultToZipFile,
  importVaultFromZipPicker,
  restoreVaultFromAndroidFolder,
} from '@/lib/vaultBackup';
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
    changePin,
  } = useAuth();

  const [hideGallery, setHideGallery] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [backupPinRequest, setBackupPinRequest] = useState<{
    attempt: number;
    resolve: (pin: string | null) => void;
  } | null>(null);
  const [changePinOpen, setChangePinOpen] = useState(false);
  const [changePinBusy, setChangePinBusy] = useState(false);
  const [changePinError, setChangePinError] = useState<string | null>(null);

  /** Lets the restore code ask for the PIN that protected the backup. */
  const askBackupPin = useCallback<AskBackupPin>(
    (attempt) => new Promise((resolve) => setBackupPinRequest({ attempt, resolve })),
    []
  );

  const answerBackupPin = (pin: string | null) => {
    backupPinRequest?.resolve(pin);
    setBackupPinRequest(null);
  };

  const submitChangePin = async (values: Record<string, string>) => {
    const current = values.current ?? '';
    const next = values.next ?? '';
    if (next.length < 6) {
      setChangePinError('The new PIN needs at least 6 digits.');
      return;
    }
    if (next !== values.confirm) {
      setChangePinError('The new PINs do not match.');
      return;
    }
    setChangePinBusy(true);
    setChangePinError(null);
    try {
      const r = await changePin(current, next);
      if (r.ok) {
        setChangePinOpen(false);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('PIN changed', 'Use your new PIN from now on. Backups made earlier still need the old PIN.');
      } else {
        setChangePinError(
          r.reason === 'throttled'
            ? `Too many wrong attempts. Try again in ${Math.ceil(r.waitMs / 1000)}s.`
            : 'Current PIN is wrong.'
        );
      }
    } finally {
      setChangePinBusy(false);
    }
  };

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
        Alert.alert(r.ok ? 'Backup done' : 'Backup', r.message);
      } else {
        const path = await exportVaultToZipFile();
        const can = await Sharing.isAvailableAsync();
        if (!can) {
          Alert.alert('Sharing unavailable', `ZIP created at cache path; use Android folder backup instead.`);
          return;
        }
        const releaseExternalFlow = suppressBackgroundLock();
        await Sharing.shareAsync(path).finally(() => {
          releaseExternalFlow();
          void FileSystem.deleteAsync(path, { idempotent: true }).catch(() => undefined);
        });
      }
    } catch (e) {
      Alert.alert('Backup failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(null);
    }
  }, [suppressBackgroundLock]);

  const runRestoreZip = useCallback(async () => {
    setBusy('restore');
    try {
      const releaseExternalFlow = suppressBackgroundLock();
      const r = await importVaultFromZipPicker(askBackupPin).finally(releaseExternalFlow);
      Alert.alert(r.ok ? 'Restored' : 'Restore', r.message);
    } catch (e) {
      Alert.alert('Restore failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(null);
    }
  }, [askBackupPin, suppressBackgroundLock]);

  const runRestoreFolder = useCallback(async () => {
    setBusy('restore');
    try {
      const releaseExternalFlow = suppressBackgroundLock();
      const r = await restoreVaultFromAndroidFolder(askBackupPin).finally(releaseExternalFlow);
      Alert.alert(r.ok ? 'Restored' : 'Restore', r.message);
    } catch (e) {
      Alert.alert('Restore failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(null);
    }
  }, [askBackupPin, suppressBackgroundLock]);

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
              <Text style={styles.label}>Vault PIN</Text>
              <Text style={styles.sub}>Your PIN encrypts the vault key. It cannot be recovered if forgotten.</Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.smallBtn, pressed && { opacity: 0.85 }]}
              onPress={() => {
                setChangePinError(null);
                setChangePinOpen(true);
              }}>
              <Text style={styles.smallBtnText}>Change</Text>
            </Pressable>
          </View>
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
            accident, export a backup to a folder or ZIP you control (Drive, SD card, PC). Backups
            stay encrypted, and restoring one needs the PIN you had when you made it.
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
            Every vault file, and the list of file names, is encrypted with AES-256-GCM using a random
            vault key. That key is locked with your PIN (Argon2id) and, if you turn it on, with your
            biometrics. While the vault is open, files you view are decrypted into a temporary cache
            that is wiped when the vault locks.
          </Text>
        </View>
      </ScrollView>

      <PinPromptModal
        visible={!!backupPinRequest}
        title="Backup PIN"
        message={
          backupPinRequest && backupPinRequest.attempt > 1
            ? 'That PIN did not open this backup. Try again.'
            : 'Enter the vault PIN you had when this backup was made.'
        }
        fields={[{ key: 'pin', label: 'PIN' }]}
        submitLabel="Restore"
        onSubmit={(v) => answerBackupPin(v.pin ?? '')}
        onCancel={() => answerBackupPin(null)}
      />

      <PinPromptModal
        visible={changePinOpen}
        title="Change PIN"
        message="Your files are not re-encrypted; only the vault key is locked with the new PIN."
        fields={[
          { key: 'current', label: 'Current PIN' },
          { key: 'next', label: 'New PIN (6–12 digits)' },
          { key: 'confirm', label: 'Confirm new PIN' },
        ]}
        submitLabel="Change PIN"
        error={changePinError}
        busy={changePinBusy}
        onSubmit={(v) => void submitChangePin(v)}
        onCancel={() => setChangePinOpen(false)}
      />
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
  smallBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: vaultTheme.borderStrong,
    backgroundColor: vaultTheme.bgGlass,
  },
  smallBtnText: { color: vaultTheme.champagne, fontWeight: '700' },
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
