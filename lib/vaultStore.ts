import * as FileSystem from 'expo-file-system/legacy';

import type { VaultAppShortcut, VaultCategory, VaultItem } from '@/types/vault';

const META_FILE = 'vault-index.json';
const META_BACKUP_FILE = 'vault-index.backup.json';
const APPS_FILE = 'vault-apps.json';
const APPS_BACKUP_FILE = 'vault-apps.backup.json';

const VALID_CATEGORIES: VaultCategory[] = ['photo', 'audio', 'video', 'document'];

let itemWriteQueue: Promise<unknown> = Promise.resolve();
let appWriteQueue: Promise<unknown> = Promise.resolve();

export function vaultRoot(): string {
  return `${FileSystem.documentDirectory}vault/`;
}

export function metaPath(): string {
  return `${FileSystem.documentDirectory}${META_FILE}`;
}

export function metaBackupPath(): string {
  return `${FileSystem.documentDirectory}${META_BACKUP_FILE}`;
}

export function appsPath(): string {
  return `${FileSystem.documentDirectory}${APPS_FILE}`;
}

export function appsBackupPath(): string {
  return `${FileSystem.documentDirectory}${APPS_BACKUP_FILE}`;
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

function isVaultItem(value: unknown): value is VaultItem {
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

async function readJsonArrayFile<T>(
  path: string,
  guard: (value: unknown) => value is T
): Promise<T[] | null> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return null;

    const raw = await FileSystem.readAsStringAsync(path);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;

    return parsed.filter(guard);
  } catch {
    return null;
  }
}

async function writeJsonArrayWithBackup<T>(primary: string, backup: string, items: T[]): Promise<void> {
  const json = JSON.stringify(items);
  await FileSystem.writeAsStringAsync(backup, json);
  await FileSystem.writeAsStringAsync(primary, json);
}

function withSerializedQueue<T>(
  queue: 'items' | 'apps',
  task: () => Promise<T>
): Promise<T> {
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
  await writeJsonArrayWithBackup(metaPath(), metaBackupPath(), items);
}

async function saveApps(apps: VaultAppShortcut[]): Promise<void> {
  await writeJsonArrayWithBackup(appsPath(), appsBackupPath(), apps);
}

export async function ensureVaultReady(): Promise<void> {
  const root = vaultRoot();
  const info = await FileSystem.getInfoAsync(root);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  }

  const items = await readJsonArrayFile(metaPath(), isVaultItem);
  if (items == null) {
    await saveItems([]);
  } else {
    const backupInfo = await FileSystem.getInfoAsync(metaBackupPath());
    if (!backupInfo.exists) {
      await FileSystem.writeAsStringAsync(metaBackupPath(), JSON.stringify(items));
    }
  }

  const apps = await readJsonArrayFile(appsPath(), isVaultAppShortcut);
  if (apps == null) {
    await saveApps([]);
  } else {
    const backupInfo = await FileSystem.getInfoAsync(appsBackupPath());
    if (!backupInfo.exists) {
      await FileSystem.writeAsStringAsync(appsBackupPath(), JSON.stringify(apps));
    }
  }
}

export async function loadItems(): Promise<VaultItem[]> {
  const primary = await readJsonArrayFile(metaPath(), isVaultItem);
  if (primary) return primary;

  const backup = await readJsonArrayFile(metaBackupPath(), isVaultItem);
  return backup ?? [];
}

export async function writeItemsSnapshot(items: VaultItem[]): Promise<void> {
  await ensureVaultReady();
  await saveItems(items.filter(isVaultItem));
}

export async function addItem(item: VaultItem, sourceUri: string): Promise<void> {
  await ensureVaultReady();

  if (!isVaultItem(item)) {
    throw new Error('Invalid vault item payload.');
  }

  const dest = `${vaultRoot()}${item.fileName}`;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });

  try {
    await withSerializedQueue('items', async () => {
      const items = await loadItems();
      items.unshift(item);
      await saveItems(items);
    });
  } catch (error) {
    await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => undefined);
    throw error;
  }
}

export function absoluteFilePath(fileName: string): string {
  return `${vaultRoot()}${fileName}`;
}

export async function deleteItem(item: VaultItem): Promise<void> {
  await withSerializedQueue('items', async () => {
    const items = (await loadItems()).filter((x) => x.id !== item.id);
    await saveItems(items);
  });

  const path = absoluteFilePath(item.fileName);
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) {
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
  const primary = await readJsonArrayFile(appsPath(), isVaultAppShortcut);
  if (primary) return primary;

  const backup = await readJsonArrayFile(appsBackupPath(), isVaultAppShortcut);
  return backup ?? [];
}

export async function writeAppsSnapshot(apps: VaultAppShortcut[]): Promise<void> {
  await ensureVaultReady();
  await saveApps(apps.filter(isVaultAppShortcut));
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
