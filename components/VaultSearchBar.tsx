import FontAwesome from '@expo/vector-icons/FontAwesome';
import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { vaultTheme } from '@/constants/vaultTheme';

type Props = {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
};

export function VaultSearchBar({ value, onChangeText, placeholder = 'Search vault…' }: Props) {
  return (
    <View style={styles.wrap}>
      <FontAwesome name="search" size={16} color={vaultTheme.textMuted} style={styles.icon} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={vaultTheme.textMuted}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: vaultTheme.bgSurface,
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
    shadowColor: vaultTheme.shadowGold,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 3,
  },
  icon: { marginRight: 10 },
  input: {
    flex: 1,
    fontSize: 15,
    color: vaultTheme.textPrimary,
    paddingVertical: 4,
  },
});
