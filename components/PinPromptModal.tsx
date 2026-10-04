import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { vaultTheme } from '@/constants/vaultTheme';

export type PinField = { key: string; label: string };

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  fields: PinField[];
  submitLabel: string;
  error?: string | null;
  busy?: boolean;
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
};

/** A modal with one or more numeric PIN fields (backup PIN, change PIN). */
export function PinPromptModal({
  visible,
  title,
  message,
  fields,
  submitLabel,
  error,
  busy,
  onSubmit,
  onCancel,
}: Props) {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (visible) setValues({});
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          {fields.map((field, i) => (
            <View key={field.key} style={styles.field}>
              <Text style={styles.label}>{field.label}</Text>
              <TextInput
                value={values[field.key] ?? ''}
                onChangeText={(text) => setValues((v) => ({ ...v, [field.key]: text }))}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={12}
                autoFocus={i === 0}
                style={styles.input}
                placeholder="••••••"
                placeholderTextColor={vaultTheme.textMuted}
              />
            </View>
          ))}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {busy ? (
            <ActivityIndicator color={vaultTheme.gold} style={styles.busy} />
          ) : (
            <View style={styles.actions}>
              <Pressable style={styles.cancel} onPress={onCancel}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.submit} onPress={() => onSubmit(values)}>
                <Text style={styles.submitText}>{submitLabel}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    padding: 22,
    gap: 12,
    backgroundColor: vaultTheme.bgElevated,
    borderWidth: 1,
    borderColor: vaultTheme.borderStrong,
  },
  title: { fontSize: 18, fontWeight: '800', color: vaultTheme.textPrimary },
  message: { fontSize: 14, lineHeight: 20, color: vaultTheme.textSecondary },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '700', color: vaultTheme.textMuted },
  input: {
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 18,
    letterSpacing: 4,
    color: vaultTheme.textPrimary,
    backgroundColor: vaultTheme.bgGlass,
  },
  error: { color: vaultTheme.danger, fontSize: 13 },
  busy: { marginVertical: 8 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 4 },
  cancel: { paddingVertical: 12, paddingHorizontal: 16 },
  cancelText: { color: vaultTheme.textSecondary, fontWeight: '700' },
  submit: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: vaultTheme.gold,
  },
  submitText: { color: '#1a1208', fontWeight: '800' },
});
