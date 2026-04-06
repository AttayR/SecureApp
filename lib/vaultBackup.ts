import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import JSZip from 'jszip';
import { Platform } from 'react-native';

import {
  absoluteFilePath,
  appsBackupPath,
  appsPath,
  ensureVaultReady,
  loadApps,
  loadItems,
  metaBackupPath,
  metaPath,
  vaultRoot,
  writeAppsSnapshot,
  writeItemsSnapshot,
} from '@/lib/vaultStore';
import type { VaultAppShortcut, VaultItem } from '@/types/vault';

const SAF = FileSystem.StorageAccessFramework;

const MAX_ZIP_BACKUP_BYTES = 350 * 1024 * 1024;
const RESTORE_STAGING_ROOT = `${FileSystem.documentDirectory}vault-restore-staging/`;
const RESTORE_ROLLBACK_ROOT = `${FileSystem.documentDirectory}vault-rollback/`;
const VALID_CATEGORIES = new Set(['photo', 'audio', 'video', 'document']);

function isSafeVaultFileName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    !value.includes('/') &&
    !value.includes('\\')
  );
}

function isVaultItem(value: unknown): value is VaultItem {
  if (!value || typeof value !== 'object') return false;

  const item = value as Partial<VaultItem>;
  return (
    typeof item.id === 'string' &&
    item.id.length > 0 &&
    typeof item.name === 'string' &&
    item.name.length > 0 &&
    isSafeVaultFileName(item.fileName) &&
    typeof item.createdAt === 'number' &&
    Number.isFinite(item.createdAt) &&
    typeof item.category === 'string' &&
    VALID_CATEGORIES.has(item.category) &&
    (item.mimeType == null || typeof item.mimeType === 'string')
  );
}

function isVaultAppShortcut(value: unknown): value is VaultAppShortcut {
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

function parseVaultItems(raw: string): VaultItem[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const items = parsed.filter(isVaultItem);
    return items.length === parsed.length ? items : null;
  } catch {
    return null;
  }
}

function parseVaultApps(raw: string): VaultAppShortcut[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const apps = parsed.filter(isVaultAppShortcut);
    return apps.length === parsed.length ? apps : null;
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

async function stageBase64Files(
  stagingRoot: string,
  files: Array<{ fileName: string; base64: string }>
): Promise<void> {
  for (const file of files) {
    await FileSystem.writeAsStringAsync(`${stagingRoot}${file.fileName}`, file.base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }
}

async function stageCopiedFiles(
  stagingRoot: string,
  files: Array<{ fileName: string; sourceUri: string }>
): Promise<void> {
  for (const file of files) {
    await FileSystem.copyAsync({ from: file.sourceUri, to: `${stagingRoot}${file.fileName}` });
  }
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

async function vaultTotalSize(): Promise<number> {
  const items = await loadItems();
  let total = 0;
  for (const item of items) {
    const p = absoluteFilePath(item.fileName);
    const info = await FileSystem.getInfoAsync(p);
    if (info.exists && 'size' in info && typeof info.size === 'number') {
      total += info.size;
    }
  }
  return total;
}

function mimeToCreateFileMime(mime: string | undefined, fileName: string): string {
  if (mime && mime !== '*/*') return mime;
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'mp4') return 'video/mp4';
  if (ext === 'm4a') return 'audio/mp4';
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'pdf') return 'application/pdf';
  return 'application/octet-stream';
}

function baseNameForSaf(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  return i > 0 ? fileName.slice(0, i) : fileName;
}

/**
 * Copy a local `file://` vault file into a SAF document URI.
 * `FileSystem.copyAsync({ from: file, to: contentUri })` is broken on Android: the native module
 * treats the destination as a filesystem path (`Uri.path`), producing invalid `/tree/...` paths.
 */
async function writeLocalFileToSafDest(
  localPath: string,
  safFileUri: string,
  mime: string,
  logicalName: string
): Promise<void> {
  const textLike =
    mime === 'application/json' ||
    logicalName.endsWith('.json') ||
    mime.startsWith('text/');
  if (textLike) {
    const text = await FileSystem.readAsStringAsync(localPath);
    await FileSystem.writeAsStringAsync(safFileUri, text);
    return;
  }
  const b64 = await FileSystem.readAsStringAsync(localPath, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await FileSystem.writeAsStringAsync(safFileUri, b64, {
    encoding: FileSystem.EncodingType.Base64,
  });
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

/**
 * Portable .zip backup (Android + iOS). Heavy RAM if the vault is huge.
 */
export async function exportVaultToZipFile(): Promise<string> {
  await ensureVaultReady();
  const size = await vaultTotalSize();
  if (size > MAX_ZIP_BACKUP_BYTES) {
    throw new Error(
      'Vault is too large for ZIP backup on this path. On Android use “Backup to folder”, or free space and try again.'
    );
  }

  const items = await loadItems();
  const apps = await loadApps();
  const zip = new JSZip();
  zip.file('vault-index.json', JSON.stringify(items));
  zip.file('vault-apps.json', JSON.stringify(apps));
  const folder = zip.folder('vault');
  if (!folder) throw new Error('Could not create archive');

  for (const item of items) {
    const path = absoluteFilePath(item.fileName);
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) continue;
    const b64 = await FileSystem.readAsStringAsync(path, {
      encoding: FileSystem.EncodingType.Base64,
    });
    folder.file(item.fileName, b64, { base64: true });
  }

  const base64 = await zip.generateAsync({
    type: 'base64',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const name = `ARVault_vault_${Date.now()}.zip`;
  const out = `${FileSystem.cacheDirectory}${name}`;
  await FileSystem.writeAsStringAsync(out, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return out;
}

export async function importVaultFromZipPicker(): Promise<{ ok: boolean; message: string }> {
  const pick = await DocumentPicker.getDocumentAsync({
    type: 'application/zip',
    copyToCacheDirectory: true,
  });
  if (pick.canceled || !pick.assets?.[0]) {
    return { ok: false, message: 'Canceled' };
  }

  const uri = pick.assets[0].uri;
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const zip = await JSZip.loadAsync(b64, { base64: true });

  const indexFile = zip.file('vault-index.json');
  const appsFile = zip.file('vault-apps.json');
  if (!indexFile) {
    return { ok: false, message: 'Not an AR Vault backup (missing vault-index.json).' };
  }

  const items = parseVaultItems(await indexFile.async('string'));
  if (!items) {
    return { ok: false, message: 'Invalid backup index.' };
  }

  const appsRaw = appsFile ? await appsFile.async('string') : '[]';
  const apps = parseVaultApps(appsRaw);
  if (!apps) {
    return { ok: false, message: 'Invalid apps data in backup.' };
  }

  const missingFiles = items.filter((item) => !zip.file(`vault/${item.fileName}`));
  if (missingFiles.length > 0) {
    return {
      ok: false,
      message: `Backup is incomplete (${missingFiles.length} file(s) missing). Your current vault was not changed.`,
    };
  }

  const stagingRoot = await createRestoreStagingRoot();

  try {
    const stagedFiles: Array<{ fileName: string; base64: string }> = [];
    for (const item of items) {
      const zf = zip.file(`vault/${item.fileName}`);
      if (!zf) {
        throw new Error(`Missing file in archive: ${item.fileName}`);
      }
      stagedFiles.push({
        fileName: item.fileName,
        base64: await zf.async('base64'),
      });
    }

    await stageBase64Files(stagingRoot, stagedFiles);
    await commitStagedRestore(stagingRoot, items, apps);
  } catch (error) {
    await FileSystem.deleteAsync(stagingRoot, { idempotent: true }).catch(() => undefined);
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Restore failed before any changes were applied.',
    };
  }

  return { ok: true, message: `Restored ${items.length} vault item(s).` };
}

export async function backupVaultToAndroidFolder(): Promise<{ ok: boolean; message: string }> {
  if (Platform.OS !== 'android') {
    return { ok: false, message: 'Folder backup is only available on Android.' };
  }
  const perm = await SAF.requestDirectoryPermissionsAsync();
  if (!perm.granted || !perm.directoryUri) {
    return { ok: false, message: 'Folder access was not granted.' };
  }

  await ensureVaultReady();
  const parent = perm.directoryUri;
  const folderName = `ARVault_backup_${Date.now()}`;
  const backupRoot = await SAF.makeDirectoryAsync(parent, folderName);
  const filesDir = await SAF.makeDirectoryAsync(backupRoot, 'vault');

  const copyToSaf = async (localPath: string, logicalName: string, mime: string) => {
    const base = baseNameForSaf(logicalName);
    const dest = await SAF.createFileAsync(filesDir, base, mimeToCreateFileMime(mime, logicalName));
    await writeLocalFileToSafDest(localPath, dest, mime, logicalName);
  };

  await copyToSaf(metaPath(), 'vault-index.json', 'application/json');
  await copyToSaf(appsPath(), 'vault-apps.json', 'application/json');

  const items = await loadItems();
  for (const item of items) {
    const local = absoluteFilePath(item.fileName);
    const info = await FileSystem.getInfoAsync(local);
    if (!info.exists) continue;
    await copyToSaf(local, item.fileName, item.mimeType ?? 'application/octet-stream');
  }

  return {
    ok: true,
    message: `Saved folder “${folderName}” inside the location you chose. It stays on your phone even if you uninstall AR Vault — keep it safe.`,
  };
}

export async function restoreVaultFromAndroidFolder(): Promise<{ ok: boolean; message: string }> {
  if (Platform.OS !== 'android') {
    return { ok: false, message: 'Folder restore is only on Android.' };
  }
  const perm = await SAF.requestDirectoryPermissionsAsync();
  if (!perm.granted || !perm.directoryUri) {
    return { ok: false, message: 'Folder access was not granted.' };
  }

  const allFiles = await listAllSafFiles(perm.directoryUri);
  let indexUri: string | null = null;
  let appsUri: string | null = null;
  const byLeaf = new Map<string, string>();

  for (const uri of allFiles) {
    const leaf = leafFromSafUri(uri);
    byLeaf.set(leaf, uri);
    if (leaf.includes('vault-index') && leaf.endsWith('.json')) indexUri = uri;
    if (leaf.includes('vault-apps') && leaf.endsWith('.json')) appsUri = uri;
  }

  if (!indexUri) {
    for (const uri of allFiles) {
      try {
        const txt = await FileSystem.readAsStringAsync(uri);
        const parsed = parseVaultItems(txt);
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
        'Could not find vault data. Open the ARVault_backup_* folder (the one that contains vault-index and your files).',
    };
  }

  const itemsRaw = await FileSystem.readAsStringAsync(indexUri);
  const items = parseVaultItems(itemsRaw);
  if (!items) {
    return { ok: false, message: 'Invalid vault index in folder.' };
  }

  let apps: VaultAppShortcut[] = [];
  if (appsUri) {
    try {
      const parsedApps = parseVaultApps(await FileSystem.readAsStringAsync(appsUri));
      apps = parsedApps ?? [];
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

  const missingFiles = items.filter((item) => !findUriForFile(item.fileName));
  if (missingFiles.length > 0) {
    return {
      ok: false,
      message: `Backup is incomplete (${missingFiles.length} file(s) missing). Your current vault was not changed.`,
    };
  }

  const stagingRoot = await createRestoreStagingRoot();

  try {
    await stageCopiedFiles(
      stagingRoot,
      items.map((item) => ({
        fileName: item.fileName,
        sourceUri: findUriForFile(item.fileName)!,
      }))
    );

    await commitStagedRestore(stagingRoot, items, apps);
  } catch (error) {
    await FileSystem.deleteAsync(stagingRoot, { idempotent: true }).catch(() => undefined);
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Restore failed before any changes were applied.',
    };
  }

  return {
    ok: true,
    message: `Restored ${items.length} file(s).`,
  };
}
