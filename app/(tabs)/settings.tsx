import React from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { Text } from '@/components/Themed';
import { useAuth } from '@/contexts/AuthContext';

export default function SettingsScreen() {
  const {
    biometricAvailable,
    biometricEnabled,
    setBiometricEnabled,
    lockOnBackground,
    setLockOnBackground,
    lock,
  } = useAuth();

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.label}>Unlock with biometrics</Text>
            <Text style={styles.sub}>Fingerprint or face after PIN is set up</Text>
          </View>
          <Switch
            value={biometricEnabled}
            onValueChange={(v) => void setBiometricEnabled(v)}
            disabled={!biometricAvailable}
          />
        </View>
        {!biometricAvailable ? (
          <Text style={styles.warn}>Biometrics not available or not enrolled on this device.</Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.label}>Lock when app goes to background</Text>
            <Text style={styles.sub}>Similar to leaving Secure Folder</Text>
          </View>
          <Switch
            value={lockOnBackground}
            onValueChange={(v) => void setLockOnBackground(v)}
          />
        </View>
      </View>

      <Pressable style={({ pressed }) => [styles.lockBtn, pressed && { opacity: 0.85 }]} onPress={lock}>
        <Text style={styles.lockBtnText}>Lock vault now</Text>
      </Pressable>

      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerTitle}>About this vault</Text>
        <Text style={styles.disclaimerBody}>
          Files are stored in this app&apos;s private data directory on your phone. They are not
          visible to other apps, but anyone who unlocks your phone and knows your vault PIN could
          open this app. Samsung Secure Folder uses Knox hardware isolation; this app cannot replicate
          that. For maximum protection, use a strong device lock and this vault PIN, and uninstall or
          clear app data only if you understand your vault files will be removed.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 16 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    padding: 16,
    gap: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowText: { flex: 1 },
  label: { fontSize: 16, fontWeight: '600' },
  sub: { fontSize: 13, opacity: 0.65, marginTop: 4 },
  warn: { fontSize: 12, color: '#d29922' },
  lockBtn: {
    backgroundColor: '#21262d',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f85149',
  },
  lockBtnText: { color: '#f85149', fontWeight: '700' },
  disclaimer: { marginTop: 8, paddingVertical: 8 },
  disclaimerTitle: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  disclaimerBody: { fontSize: 13, lineHeight: 20, opacity: 0.75 },
});
