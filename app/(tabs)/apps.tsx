import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as IntentLauncher from 'expo-intent-launcher';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VaultLuxuryBackground } from '@/components/VaultLuxuryBackground';
import { VaultSearchBar } from '@/components/VaultSearchBar';
import { vaultTheme } from '@/constants/vaultTheme';
import { makeId } from '@/lib/ids';
import {
  getLaunchableAndroidApps,
  hasVaultAndroidNativeModule,
  type LaunchableAndroidApp,
} from '@/lib/vaultAndroid';
import { addApp, deleteApp, loadApps } from '@/lib/vaultStore';
import type { VaultAppShortcut } from '@/types/vault';

function appInitial(label: string): string {
  const trimmed = label.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
}

export default function AppsScreen() {
  const insets = useSafeAreaInsets();
  const [apps, setApps] = useState<VaultAppShortcut[]>([]);
  const [label, setLabel] = useState('');
  const [pkg, setPkg] = useState('');
  const [manualVisible, setManualVisible] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerLoaded, setPickerLoaded] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [availableApps, setAvailableApps] = useState<LaunchableAndroidApp[]>([]);

  const nativePickerAvailable = hasVaultAndroidNativeModule();

  const reload = useCallback(async () => {
    setApps(await loadApps());
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const persistShortcut = useCallback(
    async (nextLabel: string, nextPackageName: string): Promise<boolean> => {
      const trimmedLabel = nextLabel.trim();
      const trimmedPkg = nextPackageName.trim();

      if (!trimmedLabel || !trimmedPkg) {
        Alert.alert('Missing info', 'Choose an app or enter both a display name and package name.');
        return false;
      }

      const normalizedPkg = trimmedPkg.toLowerCase();
      if (apps.some((app) => app.packageName.trim().toLowerCase() === normalizedPkg)) {
        Alert.alert('Already added', `${trimmedLabel} is already saved in your private shortcuts.`);
        return false;
      }

      await addApp({ id: makeId(), label: trimmedLabel, packageName: trimmedPkg });
      await reload();
      return true;
    },
    [apps, reload]
  );

  const addManualShortcut = useCallback(async () => {
    const saved = await persistShortcut(label, pkg);
    if (!saved) return;

    setLabel('');
    setPkg('');
    setManualVisible(false);
    Alert.alert('Saved', 'The shortcut is ready inside AR Vault.');
  }, [label, persistShortcut, pkg]);

  const openPicker = useCallback(async () => {
    if (!nativePickerAvailable) {
      Alert.alert(
        'Android rebuild required',
        'The installed-app picker is part of the latest Android build. For now you can still add a shortcut manually below.'
      );
      setManualVisible(true);
      return;
    }

    setPickerVisible(true);

    if (pickerLoaded || pickerLoading) {
      return;
    }

    setPickerLoading(true);
    try {
      const installedApps = await getLaunchableAndroidApps();
      setAvailableApps(installedApps);
      setPickerLoaded(true);
    } catch (error) {
      Alert.alert(
        'Could not load apps',
        error instanceof Error ? error.message : 'AR Vault could not read the installed app list.'
      );
      setPickerVisible(false);
    } finally {
      setPickerLoading(false);
    }
  }, [nativePickerAvailable, pickerLoaded, pickerLoading]);

  const chooseInstalledApp = useCallback(
    async (app: LaunchableAndroidApp) => {
      const saved = await persistShortcut(app.label, app.packageName);
      if (!saved) return;

      setPickerVisible(false);
      setPickerQuery('');
      Alert.alert('Saved', `${app.label} is now available in your private shortcuts.`);
    },
    [persistShortcut]
  );

  const launch = useCallback(async (packageName: string) => {
    if (Platform.OS !== 'android') {
      Alert.alert('Android only', 'Launching installed apps by package is supported on Android.');
      return;
    }

    try {
      IntentLauncher.openApplication(packageName);
    } catch {
      Alert.alert(
        'Could not open app',
        'Android could not launch this app. It may have been removed, disabled, or changed on your phone.'
      );
    }
  }, []);

  const remove = useCallback(
    (id: string) => {
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
    },
    [reload]
  );

  const filteredApps = useMemo(() => {
    const query = pickerQuery.trim().toLowerCase();
    if (!query) return availableApps;

    return availableApps.filter((app) => {
      const labelValue = app.label.toLowerCase();
      const packageValue = app.packageName.toLowerCase();
      return labelValue.includes(query) || packageValue.includes(query);
    });
  }, [availableApps, pickerQuery]);

  if (Platform.OS !== 'android') {
    return (
      <VaultLuxuryBackground>
        <View style={styles.pad}>
          <Text style={styles.note}>
            Private app shortcuts are available on Android. On this platform, use the system to
            organize apps.
          </Text>
        </View>
      </VaultLuxuryBackground>
    );
  }

  return (
    <VaultLuxuryBackground>
      <View style={styles.screen}>
        <View style={styles.form}>
          <Text style={styles.formTitle}>Private shortcuts</Text>
          <Text style={styles.hint}>
            Choose apps from your phone, then open them after unlocking AR Vault. This is a private
            launcher, not a system-level app hider.
          </Text>

          <Pressable
            style={({ pressed }) => [styles.pickBtn, pressed && { opacity: 0.95 }]}
            onPress={() => void openPicker()}>
            <View style={styles.pickBtnIcon}>
              <FontAwesome name="th-large" size={18} color={vaultTheme.bgDeep} />
            </View>
            <View style={styles.pickBtnCopy}>
              <Text style={styles.pickBtnTitle}>Choose installed app</Text>
              <Text style={styles.pickBtnMeta}>
                {nativePickerAvailable
                  ? 'Pick by app name. No package typing needed.'
                  : 'If this option is unavailable, use the manual entry below.'}
              </Text>
            </View>
            <FontAwesome name="angle-right" size={18} color={vaultTheme.goldMuted} />
          </Pressable>

          <Pressable
            onPress={() => setManualVisible((value) => !value)}
            style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.92 }]}>
            <Text style={styles.secondaryBtnText}>
              {manualVisible ? 'Hide manual entry' : 'Add manually instead'}
            </Text>
          </Pressable>

          <Text style={styles.helperText}>
            {apps.length === 0
              ? 'No shortcuts saved yet.'
              : `${apps.length} shortcut${apps.length === 1 ? '' : 's'} saved.`}
          </Text>

          {manualVisible ? (
            <View style={styles.manualSection}>
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
                onPress={() => void addManualShortcut()}>
                <Text style={styles.addBtnText}>Save shortcut</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <FlatList
          data={apps}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: Math.max(insets.bottom + 20, 32) },
          ]}
          ListEmptyComponent={
            <Text style={styles.empty}>
              No shortcuts yet. Choose an installed app to add one in a single tap.
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Pressable style={styles.rowMain} onPress={() => void launch(item.packageName)}>
                <View style={styles.iconRing}>
                  <Text style={styles.iconLetter}>{appInitial(item.label)}</Text>
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

        <Modal
          visible={pickerVisible}
          animationType="slide"
          transparent={false}
          onRequestClose={() => setPickerVisible(false)}>
          <VaultLuxuryBackground>
            <View
              style={[
                styles.modalScreen,
                {
                  paddingTop: insets.top + 10,
                  paddingBottom: Math.max(insets.bottom, 18),
                },
              ]}>
              <View style={styles.modalHeader}>
                <Pressable
                  onPress={() => setPickerVisible(false)}
                  hitSlop={12}
                  style={styles.modalClose}>
                  <FontAwesome name="arrow-left" size={22} color={vaultTheme.champagne} />
                </Pressable>
                <View style={styles.modalTitleWrap}>
                  <Text style={styles.modalEyebrow}>AR Vault</Text>
                  <Text style={styles.modalTitle}>Choose App</Text>
                </View>
              </View>

              <Text style={styles.modalHint}>
                Search by app name, then tap once to save it as a private shortcut.
              </Text>

              <VaultSearchBar
                value={pickerQuery}
                onChangeText={setPickerQuery}
                placeholder="Search installed apps"
              />

              {pickerLoading ? (
                <View style={styles.modalLoading}>
                  <ActivityIndicator size="large" color={vaultTheme.gold} />
                  <Text style={styles.modalLoadingText}>Loading installed apps…</Text>
                </View>
              ) : (
                <FlatList
                  data={filteredApps}
                  keyExtractor={(item) => item.packageName}
                  contentContainerStyle={styles.modalList}
                  keyboardShouldPersistTaps="handled"
                  ListEmptyComponent={
                    <View style={styles.emptyState}>
                      <FontAwesome name="search" size={34} color={vaultTheme.textMuted} />
                      <Text style={styles.emptyText}>
                        {pickerQuery.trim()
                          ? 'No apps match that search.'
                          : 'No launchable apps were found on this device.'}
                      </Text>
                    </View>
                  }
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => void chooseInstalledApp(item)}
                      style={({ pressed }) => [
                        styles.modalRow,
                        pressed && { opacity: 0.94 },
                      ]}>
                      <View style={styles.modalAppIcon}>
                        <Text style={styles.modalAppLetter}>{appInitial(item.label)}</Text>
                      </View>
                      <View style={styles.modalRowText}>
                        <Text style={styles.modalRowTitle}>{item.label}</Text>
                        <Text style={styles.modalRowPkg} numberOfLines={1}>
                          {item.packageName}
                        </Text>
                      </View>
                      <FontAwesome name="plus" size={15} color={vaultTheme.gold} />
                    </Pressable>
                  )}
                />
              )}
            </View>
          </VaultLuxuryBackground>
        </Modal>
      </View>
    </VaultLuxuryBackground>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  pad: {
    flex: 1,
    padding: 22,
  },
  note: {
    fontSize: 15,
    lineHeight: 22,
    color: vaultTheme.textSecondary,
  },
  form: {
    padding: 16,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 22,
    backgroundColor: vaultTheme.bgCard,
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
    marginBottom: 8,
    gap: 12,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: vaultTheme.champagne,
  },
  hint: {
    fontSize: 13,
    lineHeight: 20,
    color: vaultTheme.textSecondary,
  },
  pickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: vaultTheme.bgElevated,
    borderWidth: 1,
    borderColor: vaultTheme.borderStrong,
  },
  pickBtnIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: vaultTheme.gold,
  },
  pickBtnCopy: {
    flex: 1,
  },
  pickBtnTitle: {
    color: vaultTheme.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  pickBtnMeta: {
    marginTop: 4,
    color: vaultTheme.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  secondaryBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
    backgroundColor: vaultTheme.bgGlass,
  },
  secondaryBtnText: {
    color: vaultTheme.gold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  helperText: {
    color: vaultTheme.textMuted,
    fontSize: 12,
  },
  manualSection: {
    gap: 10,
    paddingTop: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
    borderRadius: 14,
    padding: 14,
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
    marginTop: 2,
  },
  addBtnText: {
    color: vaultTheme.champagne,
    fontWeight: '700',
  },
  list: {
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  empty: {
    textAlign: 'center',
    color: vaultTheme.textMuted,
    padding: 28,
    fontSize: 14,
    lineHeight: 20,
  },
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
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: vaultTheme.bgElevated,
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconLetter: {
    color: vaultTheme.gold,
    fontSize: 18,
    fontWeight: '800',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: vaultTheme.textPrimary,
  },
  rowPkg: {
    fontSize: 12,
    color: vaultTheme.textMuted,
    marginTop: 3,
  },
  trash: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  modalScreen: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  modalClose: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
  },
  modalTitleWrap: {
    flex: 1,
  },
  modalEyebrow: {
    color: vaultTheme.goldMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  modalTitle: {
    marginTop: 4,
    color: vaultTheme.textPrimary,
    fontSize: 26,
    fontWeight: '900',
  },
  modalHint: {
    marginHorizontal: 16,
    marginBottom: 12,
    color: vaultTheme.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  modalLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  modalLoadingText: {
    color: vaultTheme.textSecondary,
    fontSize: 14,
  },
  modalList: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
    backgroundColor: vaultTheme.bgCard,
    marginBottom: 10,
  },
  modalAppIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: vaultTheme.bgElevated,
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
  },
  modalAppLetter: {
    color: vaultTheme.gold,
    fontSize: 17,
    fontWeight: '800',
  },
  modalRowText: {
    flex: 1,
  },
  modalRowTitle: {
    color: vaultTheme.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  modalRowPkg: {
    color: vaultTheme.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 42,
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyText: {
    color: vaultTheme.textSecondary,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
});
