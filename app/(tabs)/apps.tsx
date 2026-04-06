import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as IntentLauncher from 'expo-intent-launcher';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { VaultLuxuryBackground } from '@/components/VaultLuxuryBackground';
import { vaultTheme } from '@/constants/vaultTheme';
import { makeId } from '@/lib/ids';
import { addApp, deleteApp, loadApps } from '@/lib/vaultStore';
import type { VaultAppShortcut } from '@/types/vault';

export default function AppsScreen() {
  const [apps, setApps] = useState<VaultAppShortcut[]>([]);
  const [label, setLabel] = useState('');
  const [pkg, setPkg] = useState('');

  const reload = useCallback(async () => {
    setApps(await loadApps());
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const addShortcut = async () => {
    const trimmedLabel = label.trim();
    const trimmedPkg = pkg.trim();
    if (!trimmedLabel || !trimmedPkg) {
      Alert.alert('Missing info', 'Enter a display name and the Android package name.');
      return;
    }
    await addApp({ id: makeId(), label: trimmedLabel, packageName: trimmedPkg });
    setLabel('');
    setPkg('');
    await reload();
  };

  const launch = async (packageName: string) => {
    if (Platform.OS !== 'android') {
      Alert.alert('Android only', 'Launching installed apps by package is supported on Android.');
      return;
    }
    try {
      IntentLauncher.openApplication(packageName);
    } catch {
      Alert.alert(
        'Could not open app',
        'Check the package name in Settings → Apps → App details (e.g. com.whatsapp).'
      );
    }
  };

  const remove = (id: string) => {
    Alert.alert('Remove shortcut?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteApp(id);
          await reload();
        },
      },
    ]);
  };

  if (Platform.OS !== 'android') {
    return (
      <VaultLuxuryBackground>
        <View style={styles.pad}>
          <Text style={styles.note}>
            App shortcuts are available on Android. On this platform, use the system to organize apps.
          </Text>
        </View>
      </VaultLuxuryBackground>
    );
  }

  return (
    <VaultLuxuryBackground>
      <View style={styles.form}>
        <Text style={styles.formTitle}>Private shortcuts</Text>
        <Text style={styles.hint}>
          Launch favourite apps only after unlocking the vault. This does not sandbox apps like Knox—it
          is an advanced quick-launcher behind your PIN.
        </Text>
        <TextInput
          placeholder="Display name (e.g. WhatsApp)"
          placeholderTextColor={vaultTheme.textMuted}
          value={label}
          onChangeText={setLabel}
          style={styles.input}
        />
        <TextInput
          placeholder="Package name (e.g. com.whatsapp)"
          placeholderTextColor={vaultTheme.textMuted}
          value={pkg}
          onChangeText={setPkg}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        <Pressable
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.9 }]}
          onPress={() => void addShortcut()}>
          <Text style={styles.addBtnText}>Save shortcut</Text>
        </Pressable>
      </View>
      <FlatList
        data={apps}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>No shortcuts yet. Add package names you use often.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Pressable style={styles.rowMain} onPress={() => void launch(item.packageName)}>
              <View style={styles.iconRing}>
                <FontAwesome name="android" size={20} color={vaultTheme.gold} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{item.label}</Text>
                <Text style={styles.rowPkg} numberOfLines={1}>
                  {item.packageName}
                </Text>
              </View>
              <FontAwesome name="external-link" size={15} color={vaultTheme.textMuted} />
            </Pressable>
            <Pressable hitSlop={12} onPress={() => remove(item.id)} style={styles.trash}>
              <FontAwesome name="trash" size={17} color={vaultTheme.danger} />
            </Pressable>
          </View>
        )}
      />
    </VaultLuxuryBackground>
  );
}

const styles = StyleSheet.create({
  pad: { flex: 1, padding: 22 },
  note: { fontSize: 15, lineHeight: 22, color: vaultTheme.textSecondary },
  form: {
    padding: 16,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 18,
    backgroundColor: vaultTheme.bgCard,
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
    marginBottom: 8,
  },
  formTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8, color: vaultTheme.champagne },
  hint: { fontSize: 13, lineHeight: 19, color: vaultTheme.textSecondary, marginBottom: 14 },
  input: {
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    fontSize: 16,
    color: vaultTheme.textPrimary,
    backgroundColor: vaultTheme.bgGlass,
  },
  addBtn: {
    backgroundColor: vaultTheme.violetDeep,
    padding: 15,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: vaultTheme.borderStrong,
    marginTop: 4,
  },
  addBtnText: { color: vaultTheme.champagne, fontWeight: '700' },
  list: { paddingHorizontal: 12, paddingBottom: 32 },
  empty: { textAlign: 'center', color: vaultTheme.textMuted, padding: 28 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: vaultTheme.bgCard,
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
  },
  iconRing: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: vaultTheme.bgElevated,
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: vaultTheme.textPrimary },
  rowPkg: { fontSize: 12, color: vaultTheme.textMuted, marginTop: 3 },
  trash: { paddingHorizontal: 12, paddingVertical: 12 },
});
