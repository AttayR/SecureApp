/**
 * Vault key management.
 *
 * - A random 256-bit vault key encrypts everything in the vault.
 * - The vault key is stored wrapped (AES-256-GCM) under a key derived from the PIN with Argon2id.
 *   A wrong PIN fails the GCM check, so no PIN hash is stored anywhere.
 * - Optionally, a second copy is stored in the Keychain / Keystore behind biometric
 *   authentication, so a successful biometric check releases the key itself.
 * - While unlocked, the vault key lives only in memory and is wiped on lock.
 */
import * as SecureStore from 'expo-secure-store';

import {
  Buffer,
  type Bytes,
  DEFAULT_KDF,
  deriveKeyFromPin,
  KEY_BYTES,
  type KdfParams,
  open,
  random,
  seal,
  wipe,
} from './primitives';

const KEY_WRAPPED = 'vault_key_v1';
const KEY_BIOMETRIC = 'vault_key_biometric_v1';
const KEY_ATTEMPTS = 'vault_pin_attempts_v1';
/** Salted SHA-256 PIN hash written by versions before encryption. Only read during migration. */
export const LEGACY_PIN_HASH = 'vault_pin_hash';

const WRAP_AAD = Buffer.from('ar-vault/key/v1', 'utf8');
const SALT_BYTES = 16;

const SECURE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/** Serialized PIN-wrapped vault key. Also embedded in backups so they can be restored elsewhere. */
export type WrappedKey = {
  v: 1;
  kdf: 'argon2id';
  memory: number;
  passes: number;
  parallelism: number;
  salt: string;
  key: string;
};

export function isWrappedKey(value: unknown): value is WrappedKey {
  const w = value as Partial<WrappedKey> | null;
  return (
    !!w &&
    w.v === 1 &&
    w.kdf === 'argon2id' &&
    typeof w.memory === 'number' &&
    typeof w.passes === 'number' &&
    typeof w.parallelism === 'number' &&
    typeof w.salt === 'string' &&
    typeof w.key === 'string'
  );
}

// ---------------------------------------------------------------------------
// In-memory session key
// ---------------------------------------------------------------------------

let sessionKey: Bytes | null = null;

export function hasSessionKey(): boolean {
  return sessionKey !== null;
}

/** The unlocked vault key. Throws while the vault is locked. */
export function getSessionKey(): Bytes {
  if (!sessionKey) throw new Error('The vault is locked.');
  return sessionKey;
}

export function setSessionKey(key: Bytes): void {
  if (sessionKey && sessionKey !== key) wipe(sessionKey);
  sessionKey = key;
}

export function clearSessionKey(): void {
  wipe(sessionKey);
  sessionKey = null;
}

// ---------------------------------------------------------------------------
// Wrapping with the PIN
// ---------------------------------------------------------------------------

export async function wrapKeyWithPin(
  vaultKey: Bytes,
  pin: string,
  params: KdfParams = DEFAULT_KDF
): Promise<WrappedKey> {
  const salt = random(SALT_BYTES);
  const kek = await deriveKeyFromPin(pin, salt, params);
  try {
    return {
      v: 1,
      kdf: 'argon2id',
      ...params,
      salt: salt.toString('base64'),
      key: seal(kek, vaultKey, WRAP_AAD).toString('base64'),
    };
  } finally {
    wipe(kek);
  }
}

/** Returns the vault key, or null if the PIN is wrong. */
export async function unwrapKeyWithPin(wrapped: WrappedKey, pin: string): Promise<Bytes | null> {
  const kek = await deriveKeyFromPin(pin, Buffer.from(wrapped.salt, 'base64'), wrapped);
  try {
    const key = open(kek, Buffer.from(wrapped.key, 'base64'), WRAP_AAD);
    return key && key.length === KEY_BYTES ? key : null;
  } finally {
    wipe(kek);
  }
}

export async function readWrappedKey(): Promise<WrappedKey | null> {
  const raw = await SecureStore.getItemAsync(KEY_WRAPPED, SECURE_OPTS);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return isWrappedKey(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeWrappedKey(wrapped: WrappedKey): Promise<void> {
  await SecureStore.setItemAsync(KEY_WRAPPED, JSON.stringify(wrapped), SECURE_OPTS);
}

/** Creates a new random vault key protected by `pin` and makes it the session key. */
export async function createVaultKey(pin: string): Promise<Bytes> {
  const vaultKey = random(KEY_BYTES);
  await writeWrappedKey(await wrapKeyWithPin(vaultKey, pin));
  setSessionKey(vaultKey);
  return vaultKey;
}

/** Re-wraps the current session key under a new PIN. The vault data is untouched. */
export async function changePin(newPin: string): Promise<void> {
  await writeWrappedKey(await wrapKeyWithPin(getSessionKey(), newPin));
}

/** Replaces the stored key with `vaultKey` wrapped under `pin` (used after restoring a backup). */
export async function storeVaultKey(vaultKey: Bytes, pin: string): Promise<void> {
  await writeWrappedKey(await wrapKeyWithPin(vaultKey, pin));
}

// ---------------------------------------------------------------------------
// Biometric copy
// ---------------------------------------------------------------------------

const BIOMETRIC_OPTS: SecureStore.SecureStoreOptions = {
  requireAuthentication: true,
  authenticationPrompt: 'Unlock AR Vault',
  keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
};

export async function enableBiometricKey(): Promise<void> {
  await SecureStore.setItemAsync(
    KEY_BIOMETRIC,
    getSessionKey().toString('base64'),
    BIOMETRIC_OPTS
  );
}

export async function disableBiometricKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_BIOMETRIC, BIOMETRIC_OPTS).catch(() => undefined);
}

export type BiometricResult =
  | { ok: true; key: Bytes }
  | { ok: false; reason: 'cancelled' | 'invalidated' | 'missing' };

/**
 * Shows the system biometric prompt and returns the vault key on success.
 * If the biometric set changed, the OS invalidates the stored copy; it is removed and the
 * user must unlock with the PIN (and can turn biometrics on again afterwards).
 */
export async function unlockKeyWithBiometrics(): Promise<BiometricResult> {
  let raw: string | null;
  try {
    raw = await SecureStore.getItemAsync(KEY_BIOMETRIC, BIOMETRIC_OPTS);
  } catch (error) {
    const message = String(error).toLowerCase();
    if (message.includes('invalidat') || message.includes('not found') || message.includes('changed')) {
      await disableBiometricKey();
      return { ok: false, reason: 'invalidated' };
    }
    return { ok: false, reason: 'cancelled' };
  }
  if (!raw) return { ok: false, reason: 'missing' };
  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_BYTES) {
    await disableBiometricKey();
    return { ok: false, reason: 'invalidated' };
  }
  return { ok: true, key };
}

// ---------------------------------------------------------------------------
// Wrong-PIN throttling
// ---------------------------------------------------------------------------

const FREE_ATTEMPTS = 5;
const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 60 * 60_000;

type AttemptState = { failures: number; lockedUntil: number };

async function readAttempts(): Promise<AttemptState> {
  try {
    const raw = await SecureStore.getItemAsync(KEY_ATTEMPTS, SECURE_OPTS);
    const parsed = raw ? (JSON.parse(raw) as Partial<AttemptState>) : null;
    return {
      failures: Number(parsed?.failures) || 0,
      lockedUntil: Number(parsed?.lockedUntil) || 0,
    };
  } catch {
    return { failures: 0, lockedUntil: 0 };
  }
}

/** Milliseconds until the next PIN attempt is allowed (0 if allowed now). */
export async function pinRetryDelayMs(): Promise<number> {
  const { lockedUntil } = await readAttempts();
  return Math.max(0, lockedUntil - Date.now());
}

/** Records a wrong PIN and returns the resulting wait before the next attempt. */
export async function recordFailedPin(): Promise<number> {
  const state = await readAttempts();
  const failures = state.failures + 1;
  const over = failures - FREE_ATTEMPTS;
  const delay = over < 0 ? 0 : Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** over);
  await SecureStore.setItemAsync(
    KEY_ATTEMPTS,
    JSON.stringify({ failures, lockedUntil: Date.now() + delay }),
    SECURE_OPTS
  );
  return delay;
}

export async function resetFailedPins(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_ATTEMPTS, SECURE_OPTS).catch(() => undefined);
}
