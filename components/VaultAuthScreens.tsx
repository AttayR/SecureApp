import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VaultLuxuryBackground } from '@/components/VaultLuxuryBackground';
import { vaultTheme } from '@/constants/vaultTheme';
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
  const insets = useSafeAreaInsets();
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
    <VaultLuxuryBackground variant="auth">
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: Math.max(insets.top, 24),
              paddingBottom: Math.max(insets.bottom, 40),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          bounces={false}>
          <View style={styles.centerColumn}>
            <LinearGradient colors={['rgba(212,175,106,0.2)', 'rgba(30,24,48,0.4)']} style={styles.lockOrb}>
              <FontAwesome name="lock" size={40} color={vaultTheme.champagne} />
            </LinearGradient>
            <Text style={styles.kicker}>Samsung-style private space</Text>
            <Text style={styles.title}>Create your vault PIN</Text>
            <Text style={styles.sub}>
              {step === 'a' ? 'Choose a PIN (minimum 4 digits).' : 'Confirm your PIN to finish.'}
            </Text>
            <TextInput
              value={step === 'a' ? first : second}
              onChangeText={step === 'a' ? setFirst : setSecond}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={12}
              style={styles.input}
              placeholder="••••"
              placeholderTextColor={vaultTheme.textMuted}
            />
            {error ? <Text style={styles.err}>{error}</Text> : null}
            {busy ? (
              <ActivityIndicator color={vaultTheme.gold} />
            ) : (
              <Pressable
                style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
                onPress={step === 'a' ? submitFirst : submitSecond}>
                <LinearGradient
                  colors={[...vaultTheme.gradientGold] as [string, string]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.btnGrad}>
                  <Text style={styles.btnText}>{step === 'a' ? 'Continue' : 'Create vault'}</Text>
                </LinearGradient>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </VaultLuxuryBackground>
  );
}

function UnlockPin({ error, onError }: { error: string | null; onError: (s: string | null) => void }) {
  const insets = useSafeAreaInsets();
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
    <VaultLuxuryBackground variant="auth">
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: Math.max(insets.top, 24),
              paddingBottom: Math.max(insets.bottom, 40),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          bounces={false}>
          <View style={styles.centerColumn}>
            <LinearGradient colors={['rgba(155,126,217,0.25)', 'rgba(30,24,48,0.35)']} style={styles.lockOrb}>
              <FontAwesome name="shield" size={38} color={vaultTheme.champagne} />
            </LinearGradient>
            <Text style={styles.kicker}>Secured</Text>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.sub}>Enter PIN to open your vault</Text>
            <TextInput
              value={pin}
              onChangeText={setPin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={12}
              style={styles.input}
              placeholder="••••"
              placeholderTextColor={vaultTheme.textMuted}
              onSubmitEditing={onUnlock}
            />
            {error ? <Text style={styles.err}>{error}</Text> : null}
            {busy ? (
              <ActivityIndicator color={vaultTheme.gold} />
            ) : (
              <>
                <Pressable style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]} onPress={onUnlock}>
                  <LinearGradient
                    colors={[...vaultTheme.gradientGold] as [string, string]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.btnGrad}>
                    <Text style={styles.btnText}>Unlock vault</Text>
                  </LinearGradient>
                </Pressable>
                {biometricEnabled && biometricAvailable ? (
                  <Pressable
                    style={({ pressed }) => [styles.btnOutline, pressed && { opacity: 0.85 }]}
                    onPress={onBio}>
                    <Text style={styles.btnOutlineText}>Use biometrics</Text>
                  </Pressable>
                ) : null}
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </VaultLuxuryBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  centerColumn: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    alignItems: 'center',
  },
  lockOrb: {
    width: 100,
    height: 100,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: vaultTheme.borderStrong,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    color: vaultTheme.goldMuted,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: { fontSize: 26, fontWeight: '800', color: vaultTheme.textPrimary, marginBottom: 8 },
  sub: { fontSize: 15, color: vaultTheme.textSecondary, marginBottom: 24, textAlign: 'center' },
  input: {
    width: '100%',
    maxWidth: 300,
    borderWidth: 1,
    borderColor: vaultTheme.borderSubtle,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    fontSize: 20,
    letterSpacing: 4,
    marginBottom: 14,
    color: vaultTheme.textPrimary,
    backgroundColor: vaultTheme.bgGlass,
  },
  err: { color: vaultTheme.danger, marginBottom: 12, textAlign: 'center' },
  btn: { marginTop: 8, borderRadius: 16, overflow: 'hidden', minWidth: 220 },
  btnPressed: { opacity: 0.92 },
  btnGrad: { paddingVertical: 16, paddingHorizontal: 36, alignItems: 'center' },
  btnText: { color: '#1a1208', fontWeight: '800', fontSize: 16 },
  btnOutline: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: vaultTheme.borderStrong,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 16,
    minWidth: 220,
    alignItems: 'center',
    backgroundColor: vaultTheme.bgGlass,
  },
  btnOutlineText: { color: vaultTheme.champagne, fontWeight: '700' },
});
