import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { restoreVaultMediaToGallery } from '@/lib/galleryVault';
import { absoluteFilePath, deleteItems } from '@/lib/vaultStore';
import type { GalleryRestoreTarget, VaultItem } from '@/types/vault';

const FLAG_GRANT_READ_URI_PERMISSION = 1;

export function filterVaultItems(items: VaultItem[], query: string): VaultItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => item.name.toLowerCase().includes(q));
}

function mimeForItems(items: VaultItem[]): string {
  if (items.every((item) => item.category === 'video')) return 'video/*';
  if (items.every((item) => item.category === 'photo')) return 'image/*';
  return '*/*';
}

export async function shareVaultItems(
  items: VaultItem[],
  suppressBackgroundLock: (timeoutMs?: number) => () => void
): Promise<'all' | 'first-only'> {
  if (items.length === 0) return 'all';

  const can = await Sharing.isAvailableAsync();
  if (!can) {
    throw new Error('sharing-unavailable');
  }

  const mimeType = mimeForItems(items);
  const releaseExternalFlow = suppressBackgroundLock(120_000);
  try {
    if (items.length === 1) {
      await Sharing.shareAsync(absoluteFilePath(items[0].fileName), { mimeType });
      return 'all';
    }

    if (Platform.OS === 'android') {
      try {
        const contentUris: string[] = [];
        for (const item of items) {
          const contentUri = await FileSystem.getContentUriAsync(absoluteFilePath(item.fileName));
          contentUris.push(contentUri);
        }
        await IntentLauncher.startActivityAsync('android.intent.action.SEND_MULTIPLE', {
          type: mimeType,
          data: contentUris[0],
          extra: {
            'android.intent.extra.STREAM': contentUris,
          },
          flags: FLAG_GRANT_READ_URI_PERMISSION,
        });
        return 'all';
      } catch {
        await Sharing.shareAsync(absoluteFilePath(items[0].fileName), { mimeType });
        return 'first-only';
      }
    }

    await Sharing.shareAsync(absoluteFilePath(items[0].fileName), { mimeType });
    return 'first-only';
  } finally {
    releaseExternalFlow();
  }
}

export async function releaseVaultItemsToGallery(
  items: VaultItem[],
  target: GalleryRestoreTarget
): Promise<{
  released: number;
  failed: number;
  permissionDenied: boolean;
  releasedIds: string[];
}> {
  if (items.length === 0) {
    return { released: 0, failed: 0, permissionDenied: false, releasedIds: [] };
  }

  const byUri = new Map(
    items.map((item) => [
      absoluteFilePath(item.fileName),
      item,
    ] as const)
  );
  const copyResult = await restoreVaultMediaToGallery(
    [...byUri.entries()].map(([uri, item]) => ({
      uri,
      sourceAlbumId: item.sourceAlbumId,
      sourceAlbumName: item.sourceAlbumName,
    })),
    target
  );
  if (copyResult.permissionDenied) {
    return { released: 0, failed: items.length, permissionDenied: true, releasedIds: [] };
  }

  const releasedItems = copyResult.copiedUris
    .map((uri) => byUri.get(uri))
    .filter((item): item is VaultItem => !!item);

  if (releasedItems.length === 0) {
    return { released: 0, failed: items.length, permissionDenied: false, releasedIds: [] };
  }

  try {
    await deleteItems(releasedItems);
  } catch {
    throw new Error('gallery-copied-vault-delete-failed');
  }

  return {
    released: releasedItems.length,
    failed: items.length - releasedItems.length,
    permissionDenied: false,
    releasedIds: releasedItems.map((item) => item.id),
  };
}
