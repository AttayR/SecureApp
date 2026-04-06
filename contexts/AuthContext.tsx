import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';

import { hashPin, verifyPin } from '@/lib/pin';

const KEY_PIN_HASH = 'vault_pin_hash';
const KEY_BIOMETRIC = 'vault_biometric_enabled';
const KEY_LOCK_BG = 'vault_lock_on_background';
const KEY_LAST_UNLOCK = 'vault_last_unlock';

type AuthContextValue = {
  ready: boolean;
  hasPin: boolean;
  unlocked: boolean;
  biometricEnabled: boolean;
  lockOnBackground: boolean;
  biometricAvailable: boolean;
  lastUnlockFormatted: string | null;
  setPin: (pin: string) => Promise<void>;
  unlockWithPin: (pin: string) => Promise<boolean>;
  unlockWithBiometric: () => Promise<boolean>;
  lock: () => void;
  suppressBackgroundLock: (timeoutMs?: number) => () => void;
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
  const [lastUnlockIso, setLastUnlockIso] = useState<string | null>(null);
  const backgroundLockSuppressionsRef = useRef(0);

  const touchSuccessfulAccess = useCallback(async () => {
    const iso = new Date().toISOString();
    await SecureStore.setItemAsync(KEY_LAST_UNLOCK, iso);
    setLastUnlockIso(iso);
  }, []);

  const refreshSecurePrefs = useCallback(async () => {
    const [pinHash, bio, lockBg, lastU] = await Promise.all([
      SecureStore.getItemAsync(KEY_PIN_HASH),
      SecureStore.getItemAsync(KEY_BIOMETRIC),
      SecureStore.getItemAsync(KEY_LOCK_BG),
      SecureStore.getItemAsync(KEY_LAST_UNLOCK),
    ]);
    setHasPin(!!pinHash);
    setBiometricEnabledState(bio === '1');
    setLockOnBackgroundState(lockBg !== '0');
    setLastUnlockIso(lastU);
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
      if (state !== 'background' || !lockOnBackground) return;

      if (backgroundLockSuppressionsRef.current > 0) {
        if (__DEV__) {
          console.log('[SecureAPP][Auth]', 'Skipping background lock for trusted external flow', {
            activeSuppressions: backgroundLockSuppressionsRef.current,
          });
        }
        return;
      }

      setUnlocked(false);
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [lockOnBackground]);

  const setPin = useCallback(
    async (pin: string) => {
      const hashed = await hashPin(pin);
      await SecureStore.setItemAsync(KEY_PIN_HASH, hashed);
      setHasPin(true);
      setUnlocked(true);
      await touchSuccessfulAccess();
    },
    [touchSuccessfulAccess]
  );

  const unlockWithPin = useCallback(
    async (pin: string) => {
      const stored = await SecureStore.getItemAsync(KEY_PIN_HASH);
      if (!stored) return false;
      const ok = await verifyPin(pin, stored);
      if (ok) {
        setUnlocked(true);
        await touchSuccessfulAccess();
      }
      return ok;
    },
    [touchSuccessfulAccess]
  );

  const unlockWithBiometric = useCallback(async () => {
    if (!biometricEnabled) return false;
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock private vault',
      cancelLabel: 'Use PIN',
      disableDeviceFallback: false,
    });
    if (r.success) {
      setUnlocked(true);
      await touchSuccessfulAccess();
    }
    return r.success;
  }, [biometricEnabled, touchSuccessfulAccess]);

  const lock = useCallback(() => setUnlocked(false), []);

  const suppressBackgroundLock = useCallback((timeoutMs = 120000) => {
    backgroundLockSuppressionsRef.current += 1;
    let released = false;

    const release = () => {
      if (released) return;
      released = true;
      backgroundLockSuppressionsRef.current = Math.max(0, backgroundLockSuppressionsRef.current - 1);
    };

    const timeoutId = setTimeout(release, timeoutMs);

    return () => {
      clearTimeout(timeoutId);
      release();
    };
  }, []);

  const setBiometricEnabled = useCallback(async (v: boolean) => {
    await SecureStore.setItemAsync(KEY_BIOMETRIC, v ? '1' : '0');
    setBiometricEnabledState(v);
  }, []);

  const setLockOnBackground = useCallback(async (v: boolean) => {
    await SecureStore.setItemAsync(KEY_LOCK_BG, v ? '1' : '0');
    setLockOnBackgroundState(v);
  }, []);

  const lastUnlockFormatted = useMemo(() => {
    if (!lastUnlockIso) return null;
    try {
      return new Date(lastUnlockIso).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return null;
    }
  }, [lastUnlockIso]);

  const value = useMemo(
    () => ({
      ready,
      hasPin,
      unlocked,
      biometricEnabled,
      lockOnBackground,
      biometricAvailable,
      lastUnlockFormatted,
      setPin,
      unlockWithPin,
      unlockWithBiometric,
      lock,
      suppressBackgroundLock,
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
      lastUnlockFormatted,
      setPin,
      unlockWithPin,
      unlockWithBiometric,
      lock,
      suppressBackgroundLock,
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
