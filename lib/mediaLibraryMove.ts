import * as MediaLibrary from 'expo-media-library';

import { makeId } from '@/lib/ids';
import { addItem, ensureVaultReady } from '@/lib/vaultStore';
import type { VaultCategory } from '@/types/vault';

export type MediaStoreMoveAsset = {
  id: string;
  uri: string;
  filename: string;
  mediaType: MediaLibrary.MediaTypeValue;
  mimeType?: string | null;
  width: number;
  height: number;
  duration?: number;
};

type MoveMediaLibraryAssetsParams = {
  category: Extract<VaultCategory, 'photo' | 'video'>;
  assets: MediaStoreMoveAsset[];
  deleteAssets?: (assetIds: string[]) => Promise<boolean>;
};

type MoveMediaLibraryAssetsResult = {
  importedCount: number;
  copyFailedCount: number;
  deleteRequestedCount: number;
  deleteSucceeded: boolean;
};

const DEFAULT_EXTENSIONS: Record<MoveMediaLibraryAssetsParams['category'], string> = {
  photo: 'jpg',
  video: 'mp4',
};

function extensionFromMimeType(mimeType: string | null | undefined): string | null {
  if (!mimeType) return null;

  const [, subtype] = mimeType.split('/');
  if (!subtype) return null;

  const normalized = subtype.toLowerCase();
  if (normalized === 'jpeg') return 'jpg';
  if (normalized.includes('+')) {
    return normalized.split('+')[0] || null;
  }
  return normalized;
}

function extensionForAsset(
  category: MoveMediaLibraryAssetsParams['category'],
  asset: MediaStoreMoveAsset
): string {
  const match = asset.filename.match(/\.([a-z0-9]+)$/i);
  if (match?.[1]) {
    return match[1].toLowerCase();
  }

  return extensionFromMimeType(asset.mimeType) ?? DEFAULT_EXTENSIONS[category];
}

function displayNameForAsset(
  category: MoveMediaLibraryAssetsParams['category'],
  asset: MediaStoreMoveAsset
): string {
  const trimmed = asset.filename.trim();
  if (trimmed) return trimmed;
  return category === 'photo' ? `Photo ${new Date().toLocaleString()}` : `Video ${new Date().toLocaleString()}`;
}

export async function moveMediaLibraryAssetsToVault(
  params: MoveMediaLibraryAssetsParams
): Promise<MoveMediaLibraryAssetsResult> {
  const { category, assets, deleteAssets } = params;

  await ensureVaultReady();

  let importedCount = 0;
  let copyFailedCount = 0;
  const importedAssetIds: string[] = [];

  for (const asset of assets) {
    const id = makeId();
    const ext = extensionForAsset(category, asset);
    const vaultFileName = `${id}.${ext}`;

    try {
      await addItem(
        {
          id,
          category,
          name: displayNameForAsset(category, asset),
          fileName: vaultFileName,
          createdAt: Date.now(),
          mimeType:
            asset.mimeType ??
            (category === 'photo' ? 'image/jpeg' : 'video/mp4'),
        },
        asset.uri
      );
      importedCount++;
      importedAssetIds.push(asset.id);
    } catch (error) {
      copyFailedCount++;
      if (__DEV__) {
        console.log('[SecureAPP][GalleryMove] copy failed', {
          assetId: asset.id,
          filename: asset.filename,
          error: String(error),
        });
      }
    }
  }

  let deleteSucceeded = false;
  if (importedAssetIds.length > 0) {
    try {
      deleteSucceeded = await (deleteAssets
        ? deleteAssets(importedAssetIds)
        : MediaLibrary.deleteAssetsAsync(importedAssetIds));
    } catch (error) {
      if (__DEV__) {
        console.log('[SecureAPP][GalleryMove] delete failed', {
          assetIds: importedAssetIds,
          error: String(error),
        });
      }
    }
  }

  return {
    importedCount,
    copyFailedCount,
    deleteRequestedCount: importedAssetIds.length,
    deleteSucceeded,
  };
}
