import * as FileSystem from 'expo-file-system/legacy';

import { decryptFile, encryptFile, isEncryptedFile, openText, sealText } from '@/lib/crypto/fileCipher';
import { getSessionKey, hasSessionKey } from '@/lib/crypto/keyStore';
import { forgetViewFile } from '@/lib/crypto/viewCache';
import type { VaultAppShortcut, VaultCategory, VaultItem } from '@/types/vault';

/** Encrypted index files (base64 AES-256-GCM blobs sealed with the vault key). */
const META_FILE = 'vault-index.enc';
const META_BACKUP_FILE = 'vault-index.backup.enc';
const APPS_FILE = 'vault-apps.enc';
const APPS_BACKUP_FILE = 'vault-apps.backup.enc';

/** Plaintext index files written before encryption. Read once during migration, then deleted. */
const LEGACY_FILES = {
  meta: 'vault-index.json',
  metaBackup: 'vault-index.backup.json',
  apps: 'vault-apps.json',
  appsBackup: 'vault-apps.backup.json',
};

const TMP_SUFFIX = '.arv-tmp';

const VALID_CATEGORIES: VaultCategory[] = ['photo', 'audio', 'video', 'document'];

let itemWriteQueue: Promise<unknown> = Promise.resolve();
let appWriteQueue: Promise<unknown> = Promise.resolve();

const docPath = (name: string) => `${FileSystem.documentDirectory}${name}`;

export function vaultRoot(): string {
  return `${FileSystem.documentDirectory}vault/`;
}

export function metaPath(): string {
  return docPath(META_FILE);
}

export function metaBackupPath(): string {
  return docPath(META_BACKUP_FILE);
}

export function appsPath(): string {
  return docPath(APPS_FILE);
}

export function appsBackupPath(): string {
  return docPath(APPS_BACKUP_FILE);
}

function isVaultCategory(value: unknown): value is VaultCategory {
  return typeof value === 'string' && VALID_CATEGORIES.includes(value as VaultCategory);
}

function isSafeVaultFileName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    !value.includes('/') &&
    !value.includes('\\')
  );
}

export function isVaultItem(value: unknown): value is VaultItem {
  if (!value || typeof value !== 'object') return false;

  const item = value as Partial<VaultItem>;
  return (
    typeof item.id === 'string' &&
    item.id.length > 0 &&
    isVaultCategory(item.category) &&
    typeof item.name === 'string' &&
    item.name.length > 0 &&
    isSafeVaultFileName(item.fileName) &&
    typeof item.createdAt === 'number' &&
    Number.isFinite(item.createdAt) &&
    (item.mimeType == null || typeof item.mimeType === 'string') &&
    (item.encrypted == null || typeof item.encrypted === 'boolean')
  );
}

export function isVaultAppShortcut(value: unknown): value is VaultAppShortcut {
  if (!value || typeof value !== 'object') return false;

  const app = value as Partial<VaultAppShortcut>;
  return (
    typeof app.id === 'string' &&
    app.id.length > 0 &&
    typeof app.label === 'string' &&
    app.label.trim().length > 0 &&
    typeof app.packageName === 'string' &&
    app.packageName.trim().length > 0
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    return (await FileSystem.getInfoAsync(path)).exists;
  } catch {
    return false;
  }
}

function parseArray<T>(raw: string | null, guard: (value: unknown) => value is T): T[] | null {
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(guard) : null;
  } catch {
    return null;
  }
}

/** Reads and decrypts an index file. Returns null if it is missing or cannot be opened. */
async function readSealedArray<T>(path: string, guard: (value: unknown) => value is T): Promise<T[] | null> {
  if (!hasSessionKey() || !(await exists(path))) return null;
  try {
    return parseArray(openText(await FileSystem.readAsStringAsync(path), getSessionKey()), guard);
  } catch {
    return null;
  }
}

async function readPlainArray<T>(path: string, guard: (value: unknown) => value is T): Promise<T[] | null> {
  if (!(await exists(path))) return null;
  try {
    return parseArray(await FileSystem.readAsStringAsync(path), guard);
  } catch {
    return null;
  }
}

async function writeSealedArrayWithBackup<T>(primary: string, backup: string, items: T[]): Promise<void> {
  const sealed = sealText(JSON.stringify(items), getSessionKey());
  await FileSystem.writeAsStringAsync(backup, sealed);
  await FileSystem.writeAsStringAsync(primary, sealed);
}

function withSerializedQueue<T>(queue: 'items' | 'apps', task: () => Promise<T>): Promise<T> {
  const current = queue === 'items' ? itemWriteQueue : appWriteQueue;
  const next = current.then(task, task);
  const settled = next.then(
    () => undefined,
    () => undefined
  );

  if (queue === 'items') {
    itemWriteQueue = settled;
  } else {
    appWriteQueue = settled;
  }

  return next;
}

async function saveItems(items: VaultItem[]): Promise<void> {
  await writeSealedArrayWithBackup(metaPath(), metaBackupPath(), items);
}

async function saveApps(apps: VaultAppShortcut[]): Promise<void> {
  await writeSealedArrayWithBackup(appsPath(), appsBackupPath(), apps);
}

/** Creates the vault folder and empty encrypted indexes. Requires the vault to be unlocked. */
export async function ensureVaultReady(): Promise<void> {
  getSessionKey();
  if (!(await exists(vaultRoot()))) {
    await FileSystem.makeDirectoryAsync(vaultRoot(), { intermediates: true });
  }
  if (!(await exists(metaPath())) && !(await exists(metaBackupPath()))) {
    await saveItems([]);
  }
  if (!(await exists(appsPath())) && !(await exists(appsBackupPath()))) {
    await saveApps([]);
  }
}

export async function loadItems(): Promise<VaultItem[]> {
  return (
    (await readSealedArray(metaPath(), isVaultItem)) ??
    (await readSealedArray(metaBackupPath(), isVaultItem)) ??
    []
  );
}

export async function writeItemsSnapshot(items: VaultItem[]): Promise<void> {
  await ensureVaultReady();
  await withSerializedQueue('items', () => saveItems(items.filter(isVaultItem)));
}

export function absoluteFilePath(fileName: string): string {
  return `${vaultRoot()}${fileName}`;
}

/** True for temporary copies that pickers place in the app cache. */
function isCacheCopy(uri: string): boolean {
  return !!FileSystem.cacheDirectory && uri.startsWith(FileSystem.cacheDirectory);
}

/**
 * Encrypts `sourceUri` into the vault and records it in the index.
 * Picker copies in the app cache are deleted afterwards so no plaintext copy is left behind.
 */
export async function addItem(item: VaultItem, sourceUri: string): Promise<void> {
  await ensureVaultReady();

  const record: VaultItem = { ...item, encrypted: true };
  if (!isVaultItem(record)) {
    throw new Error('Invalid vault item payload.');
  }

  // content:// and other non-file URIs are copied locally first so they can be streamed.
  let localSource = sourceUri;
  let tempCopy: string | null = null;
  if (!sourceUri.startsWith('file://')) {
    tempCopy = `${FileSystem.cacheDirectory}import-${record.id}`;
    await FileSystem.copyAsync({ from: sourceUri, to: tempCopy });
    localSource = tempCopy;
  }

  const dest = absoluteFilePath(record.fileName);
  try {
    await encryptFile(localSource, dest, getSessionKey());
    await withSerializedQueue('items', async () => {
      const items = await loadItems();
      items.unshift(record);
      await saveItems(items);
    });
  } catch (error) {
    await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => undefined);
    throw error;
  } finally {
    if (tempCopy) await FileSystem.deleteAsync(tempCopy, { idempotent: true }).catch(() => undefined);
    if (isCacheCopy(sourceUri)) {
      await FileSystem.deleteAsync(sourceUri, { idempotent: true }).catch(() => undefined);
    }
  }
}

export async function deleteItem(item: VaultItem): Promise<void> {
  await withSerializedQueue('items', async () => {
    const items = (await loadItems()).filter((x) => x.id !== item.id);
    await saveItems(items);
  });

  await forgetViewFile(item.id);

  const path = absoluteFilePath(item.fileName);
  try {
    if (await exists(path)) {
      await FileSystem.deleteAsync(path, { idempotent: true });
    }
  } catch (error) {
    if (__DEV__) {
      console.log('[SecureAPP][VaultStore] file delete failed after metadata removal', {
        fileName: item.fileName,
        error: String(error),
      });
    }
  }
}

export async function loadApps(): Promise<VaultAppShortcut[]> {
  return (
    (await readSealedArray(appsPath(), isVaultAppShortcut)) ??
    (await readSealedArray(appsBackupPath(), isVaultAppShortcut)) ??
    []
  );
}

export async function writeAppsSnapshot(apps: VaultAppShortcut[]): Promise<void> {
  await ensureVaultReady();
  await withSerializedQueue('apps', () => saveApps(apps.filter(isVaultAppShortcut)));
}

export async function addApp(app: VaultAppShortcut): Promise<void> {
  await ensureVaultReady();

  if (!isVaultAppShortcut(app)) {
    throw new Error('Invalid app shortcut payload.');
  }

  await withSerializedQueue('apps', async () => {
    const apps = await loadApps();
    apps.unshift(app);
    await saveApps(apps);
  });
}

export async function deleteApp(id: string): Promise<void> {
  await withSerializedQueue('apps', async () => {
    const apps = (await loadApps()).filter((a) => a.id !== id);
    await saveApps(apps);
  });
}

// ---------------------------------------------------------------------------
// Migration from the plaintext vault
// ---------------------------------------------------------------------------

export type MigrationProgress = { done: number; total: number };

async function deleteQuietly(path: string): Promise<void> {
  await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => undefined);
}

/** Moves plaintext indexes from older versions into encrypted ones, then deletes them. */
async function migrateLegacyIndexes(): Promise<void> {
  const legacyItems =
    (await readPlainArray(docPath(LEGACY_FILES.meta), isVaultItem)) ??
    (await readPlainArray(docPath(LEGACY_FILES.metaBackup), isVaultItem));
  if (legacyItems) {
    await withSerializedQueue('items', async () => {
      const current = await loadItems();
      const known = new Set(current.map((x) => x.id));
      await saveItems([...current, ...legacyItems.filter((x) => !known.has(x.id))]);
    });
  }

  const legacyApps =
    (await readPlainArray(docPath(LEGACY_FILES.apps), isVaultAppShortcut)) ??
    (await readPlainArray(docPath(LEGACY_FILES.appsBackup), isVaultAppShortcut));
  if (legacyApps) {
    await withSerializedQueue('apps', async () => {
      const current = await loadApps();
      const known = new Set(current.map((x) => x.id));
      await saveApps([...current, ...legacyApps.filter((x) => !known.has(x.id))]);
    });
  }

  for (const name of Object.values(LEGACY_FILES)) {
    await deleteQuietly(docPath(name));
  }
}

async function markEncrypted(id: string): Promise<void> {
  await withSerializedQueue('items', async () => {
    const items = await loadItems();
    await saveItems(items.map((x) => (x.id === id ? { ...x, encrypted: true } : x)));
  });
}

/**
 * Encrypts one plaintext vault file in place.
 * The ciphertext is written to a temp file and fully verified before the plaintext is deleted,
 * and every step can be resumed after a crash without losing the file.
 */
async function encryptExistingFile(item: VaultItem): Promise<void> {
  const key = getSessionKey();
  const path = absoluteFilePath(item.fileName);
  const tmp = `${path}${TMP_SUFFIX}`;
  const hasPath = await exists(path);
  const hasTmp = await exists(tmp);

  // The file is already gone; record it so migration does not retry it on every unlock.
  if (!hasPath && !hasTmp) {
    await markEncrypted(item.id);
    return;
  }

  // Crash after the plaintext was deleted but before the rename: finish the rename.
  if (!hasPath && hasTmp) {
    await decryptFile(tmp, null, key);
    await FileSystem.moveAsync({ from: tmp, to: path });
    await markEncrypted(item.id);
    return;
  }

  if (hasTmp) await deleteQuietly(tmp); // Unfinished temp file from an earlier run.

  // Crash after the rename but before the index was updated.
  if (isEncryptedFile(path)) {
    await decryptFile(path, null, key);
    await markEncrypted(item.id);
    return;
  }

  await encryptFile(path, tmp, key);
  await decryptFile(tmp, null, key);
  await FileSystem.deleteAsync(path);
  await FileSystem.moveAsync({ from: tmp, to: path });
  await markEncrypted(item.id);
}

/** True if there is anything left from the plaintext vault to encrypt. */
export async function needsMigration(): Promise<boolean> {
  for (const name of Object.values(LEGACY_FILES)) {
    if (await exists(docPath(name))) return true;
  }
  return (await loadItems()).some((item) => !item.encrypted);
}

/** Encrypts everything left over from the plaintext vault. Safe to call on every unlock. */
export async function migrateVault(onProgress?: (p: MigrationProgress) => void): Promise<void> {
  await ensureVaultReady();
  await migrateLegacyIndexes();

  const pending = (await loadItems()).filter((item) => !item.encrypted);
  onProgress?.({ done: 0, total: pending.length });
  for (let i = 0; i < pending.length; i++) {
    await encryptExistingFile(pending[i]);
    onProgress?.({ done: i + 1, total: pending.length });
  }
}
