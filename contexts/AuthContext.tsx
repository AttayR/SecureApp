import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';

import { hashPin, verifyPin } from '@/lib/pin';

const KEY_PIN_HASH = 'vault_pin_hash';
const KEY_BIOMETRIC = 'vault_biometric_enabled';
const KEY_LOCK_BG = 'vault_lock_on_background';

type AuthContextValue = {
  ready: boolean;
  hasPin: boolean;
  unlocked: boolean;
  biometricEnabled: boolean;
  lockOnBackground: boolean;
  biometricAvailable: boolean;
  setPin: (pin: string) => Promise<void>;
  unlockWithPin: (pin: string) => Promise<boolean>;
  unlockWithBiometric: () => Promise<boolean>;
  lock: () => void;
  setBiometricEnabled: (v: boolean) => Promise<void>;
  setLockOnBackground: (v: boolean) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [lockOnBackground, setLockOnBackgroundState] = useState(true);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  const refreshSecurePrefs = useCallback(async () => {
    const [pinHash, bio, lockBg] = await Promise.all([
      SecureStore.getItemAsync(KEY_PIN_HASH),
      SecureStore.getItemAsync(KEY_BIOMETRIC),
      SecureStore.getItemAsync(KEY_LOCK_BG),
    ]);
    setHasPin(!!pinHash);
    setBiometricEnabledState(bio === '1');
    setLockOnBackgroundState(lockBg !== '0');
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!cancelled) setBiometricAvailable(hasHardware && enrolled);
      await refreshSecurePrefs();
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshSecurePrefs]);

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'background' && lockOnBackground) setUnlocked(false);
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [lockOnBackground]);

  const setPin = useCallback(async (pin: string) => {
    const hashed = await hashPin(pin);
    await SecureStore.setItemAsync(KEY_PIN_HASH, hashed);
    setHasPin(true);
    setUnlocked(true);
  }, []);

  const unlockWithPin = useCallback(async (pin: string) => {
    const stored = await SecureStore.getItemAsync(KEY_PIN_HASH);
    if (!stored) return false;
    const ok = await verifyPin(pin, stored);
    if (ok) setUnlocked(true);
    return ok;
  }, []);

  const unlockWithBiometric = useCallback(async () => {
    if (!biometricEnabled) return false;
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock secure vault',
      cancelLabel: 'Use PIN',
      disableDeviceFallback: false,
    });
    if (r.success) setUnlocked(true);
    return r.success;
  }, [biometricEnabled]);

  const lock = useCallback(() => setUnlocked(false), []);

  const setBiometricEnabled = useCallback(async (v: boolean) => {
    await SecureStore.setItemAsync(KEY_BIOMETRIC, v ? '1' : '0');
    setBiometricEnabledState(v);
  }, []);

  const setLockOnBackground = useCallback(async (v: boolean) => {
    await SecureStore.setItemAsync(KEY_LOCK_BG, v ? '1' : '0');
    setLockOnBackgroundState(v);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      hasPin,
      unlocked,
      biometricEnabled,
      lockOnBackground,
      biometricAvailable,
      setPin,
      unlockWithPin,
      unlockWithBiometric,
      lock,
      setBiometricEnabled,
      setLockOnBackground,
    }),
    [
      ready,
      hasPin,
      unlocked,
      biometricEnabled,
      lockOnBackground,
      biometricAvailable,
      setPin,
      unlockWithPin,
      unlockWithBiometric,
      lock,
      setBiometricEnabled,
      setLockOnBackground,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
