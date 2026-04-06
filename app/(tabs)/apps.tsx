import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as IntentLauncher from 'expo-intent-launcher';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { Text } from '@/components/Themed';
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
      <View style={styles.pad}>
        <Text style={styles.note}>
          App shortcuts are available on Android. On this platform, use the system to organize apps.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <View style={styles.form}>
        <Text style={styles.formTitle}>Add app shortcut</Text>
        <Text style={styles.hint}>
          After you unlock this vault, tap a shortcut to open that app. This does not clone or sandbox
          the app like Samsung Knox—it only opens it from a protected list.
        </Text>
        <TextInput
          placeholder="Display name (e.g. WhatsApp)"
          placeholderTextColor="#888"
          value={label}
          onChangeText={setLabel}
          style={styles.input}
        />
        <TextInput
          placeholder="Package name (e.g. com.whatsapp)"
          placeholderTextColor="#888"
          value={pkg}
          onChangeText={setPkg}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        <Pressable style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]} onPress={() => void addShortcut()}>
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
              <FontAwesome name="android" size={22} color="#6e5494" style={styles.rowIcon} />
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{item.label}</Text>
                <Text style={styles.rowPkg} numberOfLines={1}>
                  {item.packageName}
                </Text>
              </View>
              <FontAwesome name="external-link" size={16} color="#888" />
            </Pressable>
            <Pressable hitSlop={12} onPress={() => remove(item.id)} style={styles.trash}>
              <FontAwesome name="trash" size={18} color="#f85149" />
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { flex: 1, padding: 20 },
  note: { fontSize: 15, lineHeight: 22, opacity: 0.8 },
  form: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#333' },
  formTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  hint: { fontSize: 13, lineHeight: 18, opacity: 0.7, marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    fontSize: 16,
    color: '#fff',
    backgroundColor: '#161b22',
  },
  addBtn: { backgroundColor: '#6e5494', padding: 14, borderRadius: 12, alignItems: 'center' },
  addBtnText: { color: '#fff', fontWeight: '600' },
  list: { paddingVertical: 8 },
  empty: { textAlign: 'center', opacity: 0.6, padding: 24 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingLeft: 16 },
  rowIcon: { marginRight: 12 },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowPkg: { fontSize: 12, opacity: 0.55, marginTop: 2 },
  trash: { paddingHorizontal: 14, paddingVertical: 12 },
});
