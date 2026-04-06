import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
} from 'react-native';

import { Text, View } from '@/components/Themed';
import { useAuth } from '@/contexts/AuthContext';

export function VaultAuthScreens() {
  const { hasPin, biometricEnabled, unlockWithBiometric } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasPin || !biometricEnabled) return;
    void unlockWithBiometric();
  }, [hasPin, biometricEnabled, unlockWithBiometric]);

  if (!hasPin) {
    return <SetupPin onError={setError} error={error} />;
  }

  return <UnlockPin onError={setError} error={error} />;
}

function SetupPin({ error, onError }: { error: string | null; onError: (s: string | null) => void }) {
  const { setPin } = useAuth();
  const [step, setStep] = useState<'a' | 'b'>('a');
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [busy, setBusy] = useState(false);

  const submitFirst = () => {
    onError(null);
    if (first.length < 4) {
      onError('Use at least 4 digits.');
      return;
    }
    setStep('b');
    setSecond('');
  };

  const submitSecond = async () => {
    onError(null);
    if (second !== first) {
      onError('PINs do not match. Start again.');
      setStep('a');
      setFirst('');
      setSecond('');
      return;
    }
    setBusy(true);
    try {
      await setPin(first);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.center}>
        <FontAwesome name="lock" size={48} color="#6e5494" style={styles.icon} />
        <Text style={styles.title}>Create vault PIN</Text>
        <Text style={styles.sub}>
          {step === 'a' ? 'Choose a PIN (min. 4 digits).' : 'Confirm your PIN.'}
        </Text>
        <TextInput
          value={step === 'a' ? first : second}
          onChangeText={step === 'a' ? setFirst : setSecond}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={12}
          style={styles.input}
          placeholder="••••"
          placeholderTextColor="#888"
        />
        {error ? <Text style={styles.err}>{error}</Text> : null}
        {busy ? (
          <ActivityIndicator />
        ) : (
          <Pressable
            style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
            onPress={step === 'a' ? submitFirst : submitSecond}>
            <Text style={styles.btnText}>{step === 'a' ? 'Continue' : 'Create vault'}</Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function UnlockPin({ error, onError }: { error: string | null; onError: (s: string | null) => void }) {
  const { unlockWithPin, unlockWithBiometric, biometricEnabled, biometricAvailable } = useAuth();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  const onUnlock = async () => {
    onError(null);
    if (pin.length < 4) {
      onError('Enter your PIN.');
      return;
    }
    setBusy(true);
    try {
      const ok = await unlockWithPin(pin);
      if (!ok) {
        onError('Wrong PIN.');
        setPin('');
      }
    } finally {
      setBusy(false);
    }
  };

  const onBio = async () => {
    onError(null);
    setBusy(true);
    try {
      const ok = await unlockWithBiometric();
      if (!ok) onError('Biometric unlock failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.center}>
        <FontAwesome name="shield" size={48} color="#6e5494" style={styles.icon} />
        <Text style={styles.title}>Secure vault</Text>
        <Text style={styles.sub}>Enter PIN to continue</Text>
        <TextInput
          value={pin}
          onChangeText={setPin}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={12}
          style={styles.input}
          placeholder="••••"
          placeholderTextColor="#888"
          onSubmitEditing={onUnlock}
        />
        {error ? <Text style={styles.err}>{error}</Text> : null}
        {busy ? (
          <ActivityIndicator />
        ) : (
          <>
            <Pressable
              style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
              onPress={onUnlock}>
              <Text style={styles.btnText}>Unlock</Text>
            </Pressable>
            {biometricEnabled && biometricAvailable ? (
              <Pressable
                style={({ pressed }) => [styles.btnOutline, pressed && styles.btnOutlinePressed]}
                onPress={onBio}>
                <Text style={styles.btnOutlineText}>Use biometrics</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  icon: { marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  sub: { fontSize: 15, opacity: 0.75, marginBottom: 20, textAlign: 'center' },
  input: {
    width: '100%',
    maxWidth: 280,
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 18,
    marginBottom: 12,
    color: '#fff',
    backgroundColor: '#161b22',
  },
  err: { color: '#f85149', marginBottom: 12, textAlign: 'center' },
  btn: {
    marginTop: 8,
    backgroundColor: '#6e5494',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    minWidth: 200,
    alignItems: 'center',
  },
  btnPressed: { opacity: 0.85 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  btnOutline: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#6e5494',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
    minWidth: 200,
    alignItems: 'center',
  },
  btnOutlinePressed: { opacity: 0.75 },
  btnOutlineText: { color: '#6e5494', fontWeight: '600' },
});
