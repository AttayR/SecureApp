import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import JSZip from 'jszip';
import { Platform } from 'react-native';

import { isEncryptedFile, openText, rewrapFileKey } from '@/lib/crypto/fileCipher';
import {
  getSessionKey,
  isWrappedKey,
  readWrappedKey,
  unwrapKeyWithPin,
  type WrappedKey,
} from '@/lib/crypto/keyStore';
import { type Bytes, wipe } from '@/lib/crypto/primitives';
import {
  absoluteFilePath,
  appsBackupPath,
  appsPath,
  ensureVaultReady,
  isVaultAppShortcut,
  isVaultItem,
  loadItems,
  metaBackupPath,
  metaPath,
  migrateVault,
  needsMigration,
  vaultRoot,
  writeAppsSnapshot,
  writeItemsSnapshot,
} from '@/lib/vaultStore';
import type { VaultAppShortcut, VaultItem } from '@/types/vault';

const SAF = FileSystem.StorageAccessFramework;

const MAX_ZIP_BACKUP_BYTES = 350 * 1024 * 1024;
const RESTORE_STAGING_ROOT = `${FileSystem.documentDirectory}vault-restore-staging/`;
const RESTORE_ROLLBACK_ROOT = `${FileSystem.documentDirectory}vault-rollback/`;

/**
 * Backup format v2 (encrypted):
 *   ar-vault-backup.json  { format, version: 2, createdAt, key }  (key = vault key wrapped by the PIN)
 *   vault-index.enc       index sealed with the vault key
 *   vault-apps.enc        app shortcuts sealed with the vault key
 *   vault/<fileName>      ARV1-encrypted files, copied as they are
 *
 * Restoring needs the PIN that was set when the backup was made, unless it is the same vault key.
 * Backups from older versions (plaintext vault-index.json) can still be restored; their files are
 * encrypted right after the restore.
 */
const MANIFEST_NAME = 'ar-vault-backup.json';
const INDEX_NAME = 'vault-index.enc';
const APPS_NAME = 'vault-apps.enc';
const LEGACY_INDEX_NAME = 'vault-index.json';
const LEGACY_APPS_NAME = 'vault-apps.json';
/** On Android folder backups, names carry no extension Android might rewrite. */
const SAF_INDEX_NAME = 'vault-index-enc';
const SAF_APPS_NAME = 'vault-apps-enc';
const SAF_FILE_SUFFIX = '.arv';

type Manifest = { format: 'ar-vault-backup'; version: 2; createdAt: number; key: WrappedKey };

/** Asks the user for the PIN used when the backup was created. Resolve null to cancel. */
export type AskBackupPin = (attempt: number) => Promise<string | null>;

export type BackupResult = { ok: boolean; message: string };

const MAX_PIN_ATTEMPTS = 3;

function parseManifest(raw: string): Manifest | null {
  try {
    const m = JSON.parse(raw) as Partial<Manifest>;
    return m.format === 'ar-vault-backup' && m.version === 2 && isWrappedKey(m.key) ? (m as Manifest) : null;
  } catch {
    return null;
  }
}

function parseStrict<T>(raw: string | null, guard: (value: unknown) => value is T): T[] | null {
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const valid = parsed.filter(guard);
    return valid.length === parsed.length ? valid : null;
  } catch {
    return null;
  }
}

async function safeReadTextFile(path: string): Promise<string | null> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return null;
    return await FileSystem.readAsStringAsync(path);
  } catch {
    return null;
  }
}

async function restoreOptionalTextFile(path: string, contents: string | null): Promise<void> {
  if (contents == null) {
    await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => undefined);
    return;
  }

  await FileSystem.writeAsStringAsync(path, contents);
}

async function prepareEmptyDirectory(path: string): Promise<void> {
  await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => undefined);
  await FileSystem.makeDirectoryAsync(path, { intermediates: true });
}

async function createRestoreStagingRoot(): Promise<string> {
  await FileSystem.makeDirectoryAsync(RESTORE_STAGING_ROOT, { intermediates: true }).catch(() => undefined);
  const dir = `${RESTORE_STAGING_ROOT}${Date.now()}-${Math.random().toString(36).slice(2)}/`;
  await prepareEmptyDirectory(dir);
  return dir;
}

async function commitStagedRestore(
  stagingRoot: string,
  items: VaultItem[],
  apps: VaultAppShortcut[]
): Promise<void> {
  await ensureVaultReady();

  const previousMeta = await safeReadTextFile(metaPath());
  const previousMetaBackup = await safeReadTextFile(metaBackupPath());
  const previousApps = await safeReadTextFile(appsPath());
  const previousAppsBackup = await safeReadTextFile(appsBackupPath());

  await FileSystem.deleteAsync(RESTORE_ROLLBACK_ROOT, { idempotent: true }).catch(() => undefined);

  let movedCurrentVault = false;
  let movedStagingVault = false;

  try {
    const currentVaultInfo = await FileSystem.getInfoAsync(vaultRoot());
    if (currentVaultInfo.exists) {
      await FileSystem.moveAsync({ from: vaultRoot(), to: RESTORE_ROLLBACK_ROOT });
      movedCurrentVault = true;
    }

    await FileSystem.moveAsync({ from: stagingRoot, to: vaultRoot() });
    movedStagingVault = true;

    await writeItemsSnapshot(items);
    await writeAppsSnapshot(apps);

    await FileSystem.deleteAsync(RESTORE_ROLLBACK_ROOT, { idempotent: true }).catch(() => undefined);
  } catch (error) {
    if (movedStagingVault) {
      await FileSystem.deleteAsync(vaultRoot(), { idempotent: true }).catch(() => undefined);
    } else {
      await FileSystem.deleteAsync(stagingRoot, { idempotent: true }).catch(() => undefined);
    }

    if (movedCurrentVault) {
      await FileSystem.moveAsync({ from: RESTORE_ROLLBACK_ROOT, to: vaultRoot() }).catch(() => undefined);
    } else {
      await FileSystem.makeDirectoryAsync(vaultRoot(), { intermediates: true }).catch(() => undefined);
    }

    await restoreOptionalTextFile(metaPath(), previousMeta);
    await restoreOptionalTextFile(metaBackupPath(), previousMetaBackup);
    await restoreOptionalTextFile(appsPath(), previousApps);
    await restoreOptionalTextFile(appsBackupPath(), previousAppsBackup);

    throw error;
  } finally {
    await FileSystem.deleteAsync(stagingRoot, { idempotent: true }).catch(() => undefined);
  }
}

/** Makes sure every vault file is encrypted before it is copied into a backup. */
async function prepareForBackup(): Promise<{ manifest: Manifest; items: VaultItem[] }> {
  await ensureVaultReady();
  if (await needsMigration()) await migrateVault();
  const key = await readWrappedKey();
  if (!key) throw new Error('The vault key is missing. Lock and unlock the vault, then try again.');
  const items = (await loadItems()).filter((item) => item.encrypted);
  return { manifest: { format: 'ar-vault-backup', version: 2, createdAt: Date.now(), key }, items };
}

async function vaultTotalSize(items: VaultItem[]): Promise<number> {
  let total = 0;
  for (const item of items) {
    const info = await FileSystem.getInfoAsync(absoluteFilePath(item.fileName));
    if (info.exists && 'size' in info && typeof info.size === 'number') {
      total += info.size;
    }
  }
  return total;
}

/**
 * Finds the key that opens a v2 backup: the current vault key if it is the same vault,
 * otherwise the key unwrapped with the PIN the user enters. Returns null if cancelled.
 */
async function resolveBackupKey(
  manifest: Manifest,
  sealedIndex: string,
  askPin: AskBackupPin
): Promise<Bytes | null> {
  const current = getSessionKey();
  if (openText(sealedIndex, current) != null) return current;

  for (let attempt = 1; attempt <= MAX_PIN_ATTEMPTS; attempt++) {
    const pin = await askPin(attempt);
    if (pin == null) return null;
    const key = await unwrapKeyWithPin(manifest.key, pin);
    if (key && openText(sealedIndex, key) != null) return key;
    wipe(key);
  }
  throw new Error('Wrong PIN for this backup. Your current vault was not changed.');
}

/**
 * Restores a v2 backup whose files are already staged: re-wraps each file key from the backup's
 * vault key to the current one (only the 80-byte header changes), then swaps the vault in.
 */
async function finishEncryptedRestore(
  stagingRoot: string,
  items: VaultItem[],
  apps: VaultAppShortcut[],
  backupKey: Bytes
): Promise<void> {
  const current = getSessionKey();
  try {
    if (backupKey !== current) {
      for (const item of items) {
        const staged = `${stagingRoot}${item.fileName}`;
        if (isEncryptedFile(staged)) rewrapFileKey(staged, backupKey, current);
      }
    }
    await commitStagedRestore(stagingRoot, items, apps);
  } finally {
    if (backupKey !== current) wipe(backupKey);
  }
}

function plaintextItems(items: VaultItem[]): VaultItem[] {
  return items.map(({ encrypted: _encrypted, ...rest }) => rest);
}

function mimeToCreateFileMime(mime: string | undefined, fileName: string): string {
  if (mime && mime !== '*/*') return mime;
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'json') return 'application/json';
  return 'application/octet-stream';
}

/**
 * Copy a local `file://` vault file into a SAF document URI.
 * `FileSystem.copyAsync({ from: file, to: contentUri })` is broken on Android: the native module
 * treats the destination as a filesystem path (`Uri.path`), producing invalid `/tree/...` paths.
 */
async function writeLocalFileToSafDest(localPath: string, safFileUri: string, mime: string): Promise<void> {
  if (mime === 'application/json' || mime.startsWith('text/')) {
    await FileSystem.writeAsStringAsync(safFileUri, await FileSystem.readAsStringAsync(localPath));
    return;
  }
  const b64 = await FileSystem.readAsStringAsync(localPath, { encoding: FileSystem.EncodingType.Base64 });
  await FileSystem.writeAsStringAsync(safFileUri, b64, { encoding: FileSystem.EncodingType.Base64 });
}

function leafFromSafUri(uri: string): string {
  try {
    const decoded = decodeURIComponent(uri);
    return decoded.split('/').pop() ?? decoded.split('%2F').pop() ?? '';
  } catch {
    return uri.split('/').pop() ?? '';
  }
}

/** Collect all file URIs under a SAF tree (files only). */
async function listAllSafFiles(rootUri: string): Promise<string[]> {
  const files: string[] = [];
  const queue = [rootUri];
  while (queue.length) {
    const current = queue.shift()!;
    let children: string[];
    try {
      children = await SAF.readDirectoryAsync(current);
    } catch {
      continue;
    }
    for (const child of children) {
      try {
        await SAF.readDirectoryAsync(child);
        queue.push(child);
      } catch {
        files.push(child);
      }
    }
  }
  return files;
}

function incompleteMessage(count: number): BackupResult {
  return {
    ok: false,
    message: `Backup is incomplete (${count} file(s) missing). Your current vault was not changed.`,
  };
}

function failureMessage(error: unknown): BackupResult {
  return {
    ok: false,
    message: error instanceof Error ? error.message : 'Restore failed before any changes were applied.',
  };
}

// ---------------------------------------------------------------------------
// ZIP (iOS and Android)
// ---------------------------------------------------------------------------

/** Portable encrypted .zip backup. Heavy on RAM if the vault is huge. */
export async function exportVaultToZipFile(): Promise<string> {
  const { manifest, items } = await prepareForBackup();
  if ((await vaultTotalSize(items)) > MAX_ZIP_BACKUP_BYTES) {
    throw new Error(
      'Vault is too large for ZIP backup on this path. On Android use “Backup to folder”, or free space and try again.'
    );
  }

  const zip = new JSZip();
  zip.file(MANIFEST_NAME, JSON.stringify(manifest));
  zip.file(INDEX_NAME, (await safeReadTextFile(metaPath())) ?? '');
  zip.file(APPS_NAME, (await safeReadTextFile(appsPath())) ?? '');
  const folder = zip.folder('vault');
  if (!folder) throw new Error('Could not create archive');

  for (const item of items) {
    const path = absoluteFilePath(item.fileName);
    if (!(await FileSystem.getInfoAsync(path)).exists) continue;
    const b64 = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.Base64 });
    // Ciphertext does not compress, so store it as is.
    folder.file(item.fileName, b64, { base64: true, compression: 'STORE' });
  }

  const base64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
  const out = `${FileSystem.cacheDirectory}ARVault_vault_${Date.now()}.zip`;
  await FileSystem.writeAsStringAsync(out, base64, { encoding: FileSystem.EncodingType.Base64 });
  return out;
}

export async function importVaultFromZipPicker(askPin: AskBackupPin): Promise<BackupResult> {
  const pick = await DocumentPicker.getDocumentAsync({
    type: 'application/zip',
    copyToCacheDirectory: true,
  });
  if (pick.canceled || !pick.assets?.[0]) {
    return { ok: false, message: 'Canceled' };
  }

  const pickedUri = pick.assets[0].uri;
  let zip: JSZip;
  try {
    const b64 = await FileSystem.readAsStringAsync(pickedUri, { encoding: FileSystem.EncodingType.Base64 });
    zip = await JSZip.loadAsync(b64, { base64: true });
  } finally {
    await FileSystem.deleteAsync(pickedUri, { idempotent: true }).catch(() => undefined);
  }

  const manifestFile = zip.file(MANIFEST_NAME);
  return manifestFile
    ? restoreEncryptedZip(zip, await manifestFile.async('string'), askPin)
    : restoreLegacyZip(zip);
}

async function restoreEncryptedZip(zip: JSZip, manifestRaw: string, askPin: AskBackupPin): Promise<BackupResult> {
  const manifest = parseManifest(manifestRaw);
  const indexFile = zip.file(INDEX_NAME);
  if (!manifest || !indexFile) return { ok: false, message: 'Invalid or unsupported AR Vault backup.' };

  const sealedIndex = await indexFile.async('string');
  const sealedApps = (await zip.file(APPS_NAME)?.async('string')) ?? null;

  let backupKey: Bytes | null;
  try {
    backupKey = await resolveBackupKey(manifest, sealedIndex, askPin);
  } catch (error) {
    return failureMessage(error);
  }
  if (!backupKey) return { ok: false, message: 'Canceled' };

  const items = parseStrict(openText(sealedIndex, backupKey), isVaultItem);
  const apps = sealedApps ? parseStrict(openText(sealedApps, backupKey), isVaultAppShortcut) : [];
  if (!items || !apps) return { ok: false, message: 'Invalid backup index.' };

  const missing = items.filter((item) => !zip.file(`vault/${item.fileName}`));
  if (missing.length > 0) return incompleteMessage(missing.length);

  const stagingRoot = await createRestoreStagingRoot();
  try {
    for (const item of items) {
      const b64 = await zip.file(`vault/${item.fileName}`)!.async('base64');
      await FileSystem.writeAsStringAsync(`${stagingRoot}${item.fileName}`, b64, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }
    await finishEncryptedRestore(stagingRoot, items, apps, backupKey);
  } catch (error) {
    await FileSystem.deleteAsync(stagingRoot, { idempotent: true }).catch(() => undefined);
    return failureMessage(error);
  }

  return { ok: true, message: `Restored ${items.length} vault item(s).` };
}

async function restoreLegacyZip(zip: JSZip): Promise<BackupResult> {
  const indexFile = zip.file(LEGACY_INDEX_NAME);
  if (!indexFile) {
    return { ok: false, message: 'Not an AR Vault backup (missing backup index).' };
  }

  const items = parseStrict(await indexFile.async('string'), isVaultItem);
  if (!items) return { ok: false, message: 'Invalid backup index.' };
  const appsFile = zip.file(LEGACY_APPS_NAME);
  const apps = parseStrict(appsFile ? await appsFile.async('string') : '[]', isVaultAppShortcut);
  if (!apps) return { ok: false, message: 'Invalid apps data in backup.' };

  const missing = items.filter((item) => !zip.file(`vault/${item.fileName}`));
  if (missing.length > 0) return incompleteMessage(missing.length);

  const stagingRoot = await createRestoreStagingRoot();
  try {
    for (const item of items) {
      const b64 = await zip.file(`vault/${item.fileName}`)!.async('base64');
      await FileSystem.writeAsStringAsync(`${stagingRoot}${item.fileName}`, b64, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }
    await commitStagedRestore(stagingRoot, plaintextItems(items), apps);
  } catch (error) {
    await FileSystem.deleteAsync(stagingRoot, { idempotent: true }).catch(() => undefined);
    return failureMessage(error);
  }

  await migrateVault();
  return { ok: true, message: `Restored ${items.length} vault item(s) from an older backup and encrypted them.` };
}

// ---------------------------------------------------------------------------
// Android folder (Storage Access Framework)
// ---------------------------------------------------------------------------

export async function backupVaultToAndroidFolder(): Promise<BackupResult> {
  if (Platform.OS !== 'android') {
    return { ok: false, message: 'Folder backup is only available on Android.' };
  }
  const perm = await SAF.requestDirectoryPermissionsAsync();
  if (!perm.granted || !perm.directoryUri) {
    return { ok: false, message: 'Folder access was not granted.' };
  }

  const { manifest, items } = await prepareForBackup();
  const folderName = `ARVault_backup_${Date.now()}`;
  const backupRoot = await SAF.makeDirectoryAsync(perm.directoryUri, folderName);
  const filesDir = await SAF.makeDirectoryAsync(backupRoot, 'vault');

  const writeText = async (name: string, mime: string, text: string) => {
    const dest = await SAF.createFileAsync(filesDir, name, mime);
    await FileSystem.writeAsStringAsync(dest, text);
  };

  await writeText(MANIFEST_NAME.replace(/\.json$/, ''), 'application/json', JSON.stringify(manifest));
  await writeText(SAF_INDEX_NAME, 'text/plain', (await safeReadTextFile(metaPath())) ?? '');
  await writeText(SAF_APPS_NAME, 'text/plain', (await safeReadTextFile(appsPath())) ?? '');

  for (const item of items) {
    const local = absoluteFilePath(item.fileName);
    if (!(await FileSystem.getInfoAsync(local)).exists) continue;
    // Encrypted bytes: a neutral MIME type keeps the media scanner from indexing them.
    const mime = mimeToCreateFileMime(undefined, `${item.fileName}${SAF_FILE_SUFFIX}`);
    const dest = await SAF.createFileAsync(filesDir, `${item.fileName}${SAF_FILE_SUFFIX}`, mime);
    await writeLocalFileToSafDest(local, dest, mime);
  }

  return {
    ok: true,
    message: `Saved encrypted folder “${folderName}” inside the location you chose. It stays on your phone even if you uninstall AR Vault. Restoring it needs the PIN you have now.`,
  };
}

export async function restoreVaultFromAndroidFolder(askPin: AskBackupPin): Promise<BackupResult> {
  if (Platform.OS !== 'android') {
    return { ok: false, message: 'Folder restore is only on Android.' };
  }
  const perm = await SAF.requestDirectoryPermissionsAsync();
  if (!perm.granted || !perm.directoryUri) {
    return { ok: false, message: 'Folder access was not granted.' };
  }

  const allFiles = await listAllSafFiles(perm.directoryUri);
  const byLeaf = new Map<string, string>();
  for (const uri of allFiles) byLeaf.set(leafFromSafUri(uri), uri);
  const findLeaf = (test: (leaf: string) => boolean) => {
    for (const [leaf, uri] of byLeaf) if (test(leaf)) return uri;
    return undefined;
  };

  const manifestUri = findLeaf((leaf) => leaf.startsWith('ar-vault-backup'));
  return manifestUri
    ? restoreEncryptedFolder(manifestUri, findLeaf, byLeaf, askPin)
    : restoreLegacyFolder(allFiles, findLeaf, byLeaf);
}

async function restoreEncryptedFolder(
  manifestUri: string,
  findLeaf: (test: (leaf: string) => boolean) => string | undefined,
  byLeaf: Map<string, string>,
  askPin: AskBackupPin
): Promise<BackupResult> {
  const manifest = parseManifest(await FileSystem.readAsStringAsync(manifestUri));
  const indexUri = findLeaf((leaf) => leaf.startsWith(SAF_INDEX_NAME));
  if (!manifest || !indexUri) return { ok: false, message: 'Invalid or unsupported AR Vault backup folder.' };

  const sealedIndex = await FileSystem.readAsStringAsync(indexUri);
  const appsUri = findLeaf((leaf) => leaf.startsWith(SAF_APPS_NAME));
  const sealedApps = appsUri ? await FileSystem.readAsStringAsync(appsUri) : null;

  let backupKey: Bytes | null;
  try {
    backupKey = await resolveBackupKey(manifest, sealedIndex, askPin);
  } catch (error) {
    return failureMessage(error);
  }
  if (!backupKey) return { ok: false, message: 'Canceled' };

  const items = parseStrict(openText(sealedIndex, backupKey), isVaultItem);
  const apps = sealedApps ? parseStrict(openText(sealedApps, backupKey), isVaultAppShortcut) : [];
  if (!items || !apps) return { ok: false, message: 'Invalid vault index in folder.' };

  const uriFor = (item: VaultItem) => byLeaf.get(`${item.fileName}${SAF_FILE_SUFFIX}`);
  const missing = items.filter((item) => !uriFor(item));
  if (missing.length > 0) return incompleteMessage(missing.length);

  const stagingRoot = await createRestoreStagingRoot();
  try {
    for (const item of items) {
      await FileSystem.copyAsync({ from: uriFor(item)!, to: `${stagingRoot}${item.fileName}` });
    }
    await finishEncryptedRestore(stagingRoot, items, apps, backupKey);
  } catch (error) {
    await FileSystem.deleteAsync(stagingRoot, { idempotent: true }).catch(() => undefined);
    return failureMessage(error);
  }

  return { ok: true, message: `Restored ${items.length} file(s).` };
}

async function restoreLegacyFolder(
  allFiles: string[],
  findLeaf: (test: (leaf: string) => boolean) => string | undefined,
  byLeaf: Map<string, string>
): Promise<BackupResult> {
  let indexUri = findLeaf((leaf) => leaf.includes('vault-index') && leaf.endsWith('.json'));
  const appsUri = findLeaf((leaf) => leaf.includes('vault-apps') && leaf.endsWith('.json'));

  if (!indexUri) {
    for (const uri of allFiles) {
      try {
        const parsed = parseStrict(await FileSystem.readAsStringAsync(uri), isVaultItem);
        if (parsed && parsed.length > 0) {
          indexUri = uri;
          break;
        }
      } catch {
        /* not json */
      }
    }
  }

  if (!indexUri) {
    return {
      ok: false,
      message:
        'Could not find vault data. Open the ARVault_backup_* folder (the one that contains your backup files).',
    };
  }

  const items = parseStrict(await FileSystem.readAsStringAsync(indexUri), isVaultItem);
  if (!items) return { ok: false, message: 'Invalid vault index in folder.' };

  let apps: VaultAppShortcut[] = [];
  if (appsUri) {
    try {
      apps = parseStrict(await FileSystem.readAsStringAsync(appsUri), isVaultAppShortcut) ?? [];
    } catch {
      apps = [];
    }
  }

  const findUriForFile = (fileName: string): string | undefined => {
    const direct = byLeaf.get(fileName);
    if (direct) return direct;
    for (const [leaf, uri] of byLeaf) {
      if (leaf === fileName || leaf.endsWith(fileName) || fileName.endsWith(leaf)) {
        return uri;
      }
    }
    return undefined;
  };

  const missing = items.filter((item) => !findUriForFile(item.fileName));
  if (missing.length > 0) return incompleteMessage(missing.length);

  const stagingRoot = await createRestoreStagingRoot();
  try {
    for (const item of items) {
      await FileSystem.copyAsync({ from: findUriForFile(item.fileName)!, to: `${stagingRoot}${item.fileName}` });
    }
    await commitStagedRestore(stagingRoot, plaintextItems(items), apps);
  } catch (error) {
    await FileSystem.deleteAsync(stagingRoot, { idempotent: true }).catch(() => undefined);
    return failureMessage(error);
  }

  await migrateVault();
  return { ok: true, message: `Restored ${items.length} file(s) from an older backup and encrypted them.` };
}
