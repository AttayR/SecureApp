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
import { Alert, AppState, AppStateStatus } from 'react-native';

import type { Bytes } from '@/lib/crypto/primitives';
import {
  changePin as rewrapWithPin,
  clearSessionKey,
  createVaultKey,
  disableBiometricKey,
  enableBiometricKey,
  LEGACY_PIN_HASH,
  pinRetryDelayMs,
  readWrappedKey,
  recordFailedPin,
  resetFailedPins,
  setSessionKey,
  unlockKeyWithBiometrics,
  unwrapKeyWithPin,
} from '@/lib/crypto/keyStore';
import { clearViewCache } from '@/lib/crypto/viewCache';
import { verifyLegacyPin } from '@/lib/pin';
import { ensureVaultReady, migrateVault, needsMigration, type MigrationProgress } from '@/lib/vaultStore';

const KEY_BIOMETRIC = 'vault_biometric_enabled';
const KEY_LOCK_BG = 'vault_lock_on_background';
const KEY_LAST_UNLOCK = 'vault_last_unlock';

export type PinUnlockResult =
  | { ok: true }
  | { ok: false; reason: 'wrong-pin' | 'throttled'; waitMs: number };

export type BiometricUnlockResult = { ok: true } | { ok: false; message: string | null };

type AuthContextValue = {
  ready: boolean;
  hasPin: boolean;
  unlocked: boolean;
  /** Set while files from an older, unencrypted vault are being encrypted. */
  migration: MigrationProgress | null;
  biometricEnabled: boolean;
  lockOnBackground: boolean;
  biometricAvailable: boolean;
  lastUnlockFormatted: string | null;
  setPin: (pin: string) => Promise<void>;
  unlockWithPin: (pin: string) => Promise<PinUnlockResult>;
  unlockWithBiometric: () => Promise<BiometricUnlockResult>;
  changePin: (currentPin: string, newPin: string) => Promise<PinUnlockResult>;
  pinRetryDelayMs: () => Promise<number>;
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
  const [migration, setMigration] = useState<MigrationProgress | null>(null);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [lockOnBackground, setLockOnBackgroundState] = useState(true);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [lastUnlockIso, setLastUnlockIso] = useState<string | null>(null);
  const backgroundLockSuppressionsRef = useRef(0);
  const biometricEnabledRef = useRef(false);

  const touchSuccessfulAccess = useCallback(async () => {
    const iso = new Date().toISOString();
    await SecureStore.setItemAsync(KEY_LAST_UNLOCK, iso);
    setLastUnlockIso(iso);
  }, []);

  const refreshSecurePrefs = useCallback(async () => {
    const [wrapped, legacyHash, bio, lockBg, lastU] = await Promise.all([
      readWrappedKey(),
      SecureStore.getItemAsync(LEGACY_PIN_HASH),
      SecureStore.getItemAsync(KEY_BIOMETRIC),
      SecureStore.getItemAsync(KEY_LOCK_BG),
      SecureStore.getItemAsync(KEY_LAST_UNLOCK),
    ]);
    setHasPin(!!wrapped || !!legacyHash);
    setBiometricEnabledState(bio === '1');
    biometricEnabledRef.current = bio === '1';
    setLockOnBackgroundState(lockBg !== '0');
    setLastUnlockIso(lastU);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Plaintext view copies left behind if the app was killed while unlocked.
      await clearViewCache();
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

  const lock = useCallback(() => {
    clearSessionKey();
    void clearViewCache();
    setUnlocked(false);
  }, []);

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

      lock();
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [lockOnBackground, lock]);

  /** Common path once the vault key is known: encrypt leftovers from older versions, then open. */
  const finishUnlock = useCallback(
    async (key: Bytes) => {
      setSessionKey(key);
      await resetFailedPins();
      try {
        if (await needsMigration()) {
          setMigration({ done: 0, total: 0 });
          await migrateVault(setMigration);
        } else {
          await ensureVaultReady();
        }
      } catch (error) {
        // Migration resumes on the next unlock; files that are not encrypted yet stay readable.
        Alert.alert(
          'Encryption not finished',
          `Some files could not be encrypted yet. AR Vault will try again next time you unlock.\n\n${String(error)}`
        );
      } finally {
        setMigration(null);
      }
      setUnlocked(true);
      await touchSuccessfulAccess();
    },
    [touchSuccessfulAccess]
  );

  const setPin = useCallback(
    async (pin: string) => {
      const key = await createVaultKey(pin);
      setHasPin(true);
      await finishUnlock(key);
    },
    [finishUnlock]
  );

  const unlockWithPin = useCallback(
    async (pin: string): Promise<PinUnlockResult> => {
      const wait = await pinRetryDelayMs();
      if (wait > 0) return { ok: false, reason: 'throttled', waitMs: wait };

      const wrapped = await readWrappedKey();
      if (wrapped) {
        const key = await unwrapKeyWithPin(wrapped, pin);
        if (!key) return { ok: false, reason: 'wrong-pin', waitMs: await recordFailedPin() };
        await finishUnlock(key);
        return { ok: true };
      }

      // Upgrade from a version that only stored a PIN hash: create the vault key now.
      const legacyHash = await SecureStore.getItemAsync(LEGACY_PIN_HASH);
      if (!legacyHash || !(await verifyLegacyPin(pin, legacyHash))) {
        return { ok: false, reason: 'wrong-pin', waitMs: await recordFailedPin() };
      }
      const key = await createVaultKey(pin);
      await SecureStore.deleteItemAsync(LEGACY_PIN_HASH);
      if (biometricEnabledRef.current) {
        await enableBiometricKey().catch(() => {
          biometricEnabledRef.current = false;
          setBiometricEnabledState(false);
          return SecureStore.setItemAsync(KEY_BIOMETRIC, '0');
        });
      }
      await finishUnlock(key);
      return { ok: true };
    },
    [finishUnlock]
  );

  const unlockWithBiometric = useCallback(async (): Promise<BiometricUnlockResult> => {
    if (!biometricEnabledRef.current) return { ok: false, message: null };
    const result = await unlockKeyWithBiometrics();
    if (result.ok) {
      await finishUnlock(result.key);
      return { ok: true };
    }
    if (result.reason === 'cancelled') return { ok: false, message: null };

    // The OS invalidated the key (biometrics changed) or it was never created (older version).
    biometricEnabledRef.current = false;
    setBiometricEnabledState(false);
    await SecureStore.setItemAsync(KEY_BIOMETRIC, '0');
    return {
      ok: false,
      message:
        result.reason === 'invalidated'
          ? 'Your fingerprints or face data changed, so biometric unlock was turned off. Unlock with your PIN, then turn it on again in Settings.'
          : 'Unlock with your PIN once to finish setting up biometric unlock.',
    };
  }, [finishUnlock]);

  const changePin = useCallback(
    async (currentPin: string, newPin: string): Promise<PinUnlockResult> => {
      const wait = await pinRetryDelayMs();
      if (wait > 0) return { ok: false, reason: 'throttled', waitMs: wait };
      const wrapped = await readWrappedKey();
      const key = wrapped ? await unwrapKeyWithPin(wrapped, currentPin) : null;
      if (!key) return { ok: false, reason: 'wrong-pin', waitMs: await recordFailedPin() };
      key.fill(0);
      await resetFailedPins();
      await rewrapWithPin(newPin);
      return { ok: true };
    },
    []
  );

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
    if (v) {
      try {
        await enableBiometricKey();
      } catch {
        return; // Prompt cancelled or failed; leave biometrics off.
      }
    } else {
      await disableBiometricKey();
    }
    await SecureStore.setItemAsync(KEY_BIOMETRIC, v ? '1' : '0');
    biometricEnabledRef.current = v;
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
      migration,
      biometricEnabled,
      lockOnBackground,
      biometricAvailable,
      lastUnlockFormatted,
      setPin,
      unlockWithPin,
      unlockWithBiometric,
      changePin,
      pinRetryDelayMs,
      lock,
      suppressBackgroundLock,
      setBiometricEnabled,
      setLockOnBackground,
    }),
    [
      ready,
      hasPin,
      unlocked,
      migration,
      biometricEnabled,
      lockOnBackground,
      biometricAvailable,
      lastUnlockFormatted,
      setPin,
      unlockWithPin,
      unlockWithBiometric,
      changePin,
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
