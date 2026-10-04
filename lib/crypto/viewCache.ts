/**
 * Short-lived plaintext copies for viewing.
 *
 * Image, video and audio components and the share sheet need a real file, so an encrypted
 * item is decrypted into the app cache on demand. All copies are deleted when the vault
 * locks, and again on the next launch in case the app was killed while unlocked.
 */
import * as FileSystem from 'expo-file-system/legacy';

import type { VaultItem } from '@/types/vault';

import { decryptFile } from './fileCipher';
import { getSessionKey } from './keyStore';

const viewDir = () => `${FileSystem.cacheDirectory}vault-view/`;

const pending = new Map<string, Promise<string>>();

function extensionOf(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  return i > 0 ? fileName.slice(i) : '';
}

/** Returns a local URI with the item's plaintext, decrypting it into the cache if needed. */
export function getPlainUri(item: VaultItem): Promise<string> {
  const source = `${FileSystem.documentDirectory}vault/${item.fileName}`;
  if (!item.encrypted) return Promise.resolve(source);

  const existing = pending.get(item.id);
  if (existing) return existing;

  const task = (async () => {
    const dir = viewDir();
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
    const dest = `${dir}${item.id}${extensionOf(item.fileName)}`;
    if (!(await FileSystem.getInfoAsync(dest)).exists) {
      await decryptFile(source, dest, getSessionKey());
    }
    return dest;
  })();

  pending.set(item.id, task);
  task.catch(() => pending.delete(item.id));
  return task;
}

/** Deletes the plaintext copy of one item, if any. */
export async function forgetViewFile(id: string): Promise<void> {
  const task = pending.get(id);
  pending.delete(id);
  const uri = await task?.catch(() => null);
  if (uri) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}

/** Deletes every plaintext copy. Called on lock and at startup. */
export async function clearViewCache(): Promise<void> {
  pending.clear();
  await FileSystem.deleteAsync(viewDir(), { idempotent: true }).catch(() => undefined);
}
