import * as FileSystem from 'expo-file-system/legacy';

import type { VaultAppShortcut, VaultItem } from '@/types/vault';

const META_FILE = 'vault-index.json';
const APPS_FILE = 'vault-apps.json';

function vaultRoot(): string {
  return `${FileSystem.documentDirectory}vault/`;
}

function metaPath(): string {
  return `${FileSystem.documentDirectory}${META_FILE}`;
}

function appsPath(): string {
  return `${FileSystem.documentDirectory}${APPS_FILE}`;
}

export async function ensureVaultReady(): Promise<void> {
  const root = vaultRoot();
  const info = await FileSystem.getInfoAsync(root);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  }
}

export async function loadItems(): Promise<VaultItem[]> {
  try {
    const info = await FileSystem.getInfoAsync(metaPath());
    if (!info.exists) return [];
    const raw = await FileSystem.readAsStringAsync(metaPath());
    const parsed = JSON.parse(raw) as VaultItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveItems(items: VaultItem[]): Promise<void> {
  await FileSystem.writeAsStringAsync(metaPath(), JSON.stringify(items));
}

export async function addItem(item: VaultItem, sourceUri: string): Promise<void> {
  await ensureVaultReady();
  const dest = `${vaultRoot()}${item.fileName}`;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  const items = await loadItems();
  items.unshift(item);
  await saveItems(items);
}

export function absoluteFilePath(fileName: string): string {
  return `${vaultRoot()}${fileName}`;
}

export async function deleteItem(item: VaultItem): Promise<void> {
  const path = absoluteFilePath(item.fileName);
  const info = await FileSystem.getInfoAsync(path);
  if (info.exists) {
    await FileSystem.deleteAsync(path, { idempotent: true });
  }
  const items = (await loadItems()).filter((x) => x.id !== item.id);
  await saveItems(items);
}

export async function loadApps(): Promise<VaultAppShortcut[]> {
  try {
    const info = await FileSystem.getInfoAsync(appsPath());
    if (!info.exists) return [];
    const raw = await FileSystem.readAsStringAsync(appsPath());
    const parsed = JSON.parse(raw) as VaultAppShortcut[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveApps(apps: VaultAppShortcut[]): Promise<void> {
  await FileSystem.writeAsStringAsync(appsPath(), JSON.stringify(apps));
}

export async function addApp(app: VaultAppShortcut): Promise<void> {
  const apps = await loadApps();
  apps.unshift(app);
  await saveApps(apps);
}

export async function deleteApp(id: string): Promise<void> {
  const apps = (await loadApps()).filter((a) => a.id !== id);
  await saveApps(apps);
}
