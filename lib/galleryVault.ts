import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';

import type { GalleryRestoreTarget, VaultItem } from '@/types/vault';

export const DEFAULT_RESTORE_FOLDER = 'AR Vault';

function normalizeBasename(name: string): string {
  const base = name.trim().split(/[/\\]/).pop() ?? name.trim();
  return base.toLowerCase();
}

function dimensionsMatch(assetW: number, assetH: number, w: number, h: number): boolean {
  if (w <= 0 || h <= 0) return false;
  return (
    (assetW === w && assetH === h) ||
    (assetW === h && assetH === w)
  );
}

async function byteSizeOnDevice(
  asset: MediaLibrary.Asset,
  mediaKind: 'photo' | 'video'
): Promise<number | null> {
  const tryOne = async (uri: string): Promise<number | null> => {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists && !info.isDirectory && typeof info.size === 'number' && info.size > 0) {
        return info.size;
      }
    } catch {
      /* file:// missing on scoped storage, or content:// not readable */
    }
    return null;
  };

  let n = await tryOne(asset.uri);
  if (n != null) return n;

  const contentUri =
    mediaKind === 'video'
      ? `content://media/external/video/media/${asset.id}`
      : `content://media/external/images/media/${asset.id}`;
  n = await tryOne(contentUri);
  return n;
}

/**
 * Pick at most one gallery asset to delete: same display name as the picker, then disambiguate.
 * Picker width/height are often from the exported copy, not MediaStore — do not rely on them alone.
 */
async function pickSingleCandidate(
  candidates: MediaLibrary.Asset[],
  width: number,
  height: number,
  fileSize: number | null | undefined,
  mediaKind: 'photo' | 'video'
): Promise<MediaLibrary.Asset | null> {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  let pool = candidates;

  if (fileSize != null && fileSize > 0) {
    const sized: MediaLibrary.Asset[] = [];
    for (const c of pool) {
      const sz = await byteSizeOnDevice(c, mediaKind);
      if (sz === fileSize) {
        sized.push(c);
      }
    }
    if (sized.length === 1) return sized[0];
    if (sized.length > 1) {
      pool = sized;
    }
  }

  const dim = pool.filter((c) => dimensionsMatch(c.width, c.height, width, height));
  if (dim.length === 1) return dim[0];

  return null;
}

/**
 * Android fallback when the image picker returns no `assetId` and native delete did not run.
 * Scans the library for matching DISPLAY_NAME; if exactly one, deletes. If several share the name,
 * uses byte size (picker `fileSize`, usually original length) then dimensions as tie-breakers.
 */
export async function removeGalleryAssetByPickerMatch(params: {
  fileName: string | null | undefined;
  width: number;
  height: number;
  /** Original / stream size from the picker when available (helps disambiguate duplicate names). */
  fileSize?: number | null;
  /** @default 'photo' */
  mediaKind?: 'photo' | 'video';
  maxScan?: number;
}): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const { fileName, width, height } = params;
  if (!fileName?.trim()) return false;

  const target = normalizeBasename(fileName);
  const maxScan = params.maxScan ?? 15000;
  const pageSize = 200;
  let scanned = 0;
  let after: string | undefined;
  const mediaKind = params.mediaKind === 'video' ? 'video' : 'photo';
  const mediaType =
    mediaKind === 'video' ? MediaLibrary.MediaType.video : MediaLibrary.MediaType.photo;

  const candidates: MediaLibrary.Asset[] = [];

  try {
    const perm = await MediaLibrary.requestPermissionsAsync();
    if (!perm.granted) return false;

    while (scanned < maxScan) {
      const take = Math.min(pageSize, maxScan - scanned);
      const page = await MediaLibrary.getAssetsAsync({
        first: take,
        after,
        mediaType,
      });
      scanned += page.assets.length;

      for (const asset of page.assets) {
        if (normalizeBasename(asset.filename) === target) {
          candidates.push(asset);
        }
      }

      if (!page.hasNextPage) break;
      after = page.endCursor;
    }

    const chosen = await pickSingleCandidate(
      candidates,
      width,
      height,
      params.fileSize,
      mediaKind
    );
    if (!chosen) return false;
    return await MediaLibrary.deleteAssetsAsync(chosen.id);
  } catch {
    return false;
  }
}

/**
 * Remove a gallery asset after it was copied into the vault (Android/iOS photo library).
 */
export async function removeGalleryAsset(assetId: string | null | undefined): Promise<boolean> {
  if (!assetId) return false;
  const removed = await removeGalleryAssets([assetId]);
  return removed > 0;
}

/**
 * Batch-delete gallery assets in one system prompt (important on iOS multi-import).
 * Returns how many ids were accepted for deletion.
 */
export async function removeGalleryAssets(assetIds: string[]): Promise<number> {
  const unique = [...new Set(assetIds.filter((id) => typeof id === 'string' && id.length > 0))];
  if (unique.length === 0) return 0;
  try {
    const perm = await MediaLibrary.requestPermissionsAsync();
    if (!perm.granted) return 0;
    const ok = await MediaLibrary.deleteAssetsAsync(unique);
    return ok ? unique.length : 0;
  } catch {
    return 0;
  }
}

export function sanitizeAlbumName(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/[/\\?%*:|"<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 40);
  return cleaned || DEFAULT_RESTORE_FOLDER;
}

let albumTitleCache: Map<string, string> | null = null;
let albumTitleCacheAt = 0;

async function albumTitleForId(albumId: string): Promise<string | undefined> {
  if (!albumTitleCache || Date.now() - albumTitleCacheAt > 60_000) {
    const next = new Map<string, string>();
    try {
      const albums = await MediaLibrary.getAlbumsAsync();
      for (const album of albums) {
        if (album.id && album.title) next.set(album.id, album.title);
      }
    } catch {
      /* ignore */
    }
    albumTitleCache = next;
    albumTitleCacheAt = Date.now();
  }
  return albumTitleCache.get(albumId);
}

export async function resolveGalleryOrigin(
  assetId?: string | null,
  albumId?: string | null
): Promise<{ sourceAlbumId?: string; sourceAlbumName?: string }> {
  const id = typeof assetId === 'string' && assetId.length > 0 ? assetId : null;
  const knownAlbumId = typeof albumId === 'string' && albumId.length > 0 ? albumId : null;
  try {
    const perm = await MediaLibrary.getPermissionsAsync();
    if (!perm.granted) return knownAlbumId ? { sourceAlbumId: knownAlbumId } : {};

    let sourceAlbumId = knownAlbumId ?? undefined;
    if (!sourceAlbumId && id) {
      const info = await MediaLibrary.getAssetInfoAsync(id);
      sourceAlbumId = info.albumId;
    }
    if (!sourceAlbumId) return {};

    return {
      sourceAlbumId,
      sourceAlbumName: await albumTitleForId(sourceAlbumId),
    };
  } catch {
    return knownAlbumId ? { sourceAlbumId: knownAlbumId } : {};
  }
}

/**
 * Copy a vault file back into the system photo / video library (default gallery location).
 */
export async function copyVaultFileToGallery(localFileUri: string): Promise<boolean> {
  const result = await restoreVaultMediaToGallery(
    [{ uri: localFileUri }],
    { mode: 'original' }
  );
  return result.copiedUris.length === 1;
}

type RestoreSource = {
  uri: string;
  sourceAlbumId?: string;
  sourceAlbumName?: string;
};

async function createAssetInAlbum(
  uri: string,
  album: MediaLibrary.Album | string
): Promise<void> {
  await MediaLibrary.createAssetAsync(uri, album);
}

async function restoreOneToOriginal(item: RestoreSource): Promise<boolean> {
  if (item.sourceAlbumId) {
    try {
      await createAssetInAlbum(item.uri, item.sourceAlbumId);
      return true;
    } catch {
      /* album id may be gone after the original was deleted */
    }
  }

  const albumName = item.sourceAlbumName?.trim();
  if (albumName) {
    try {
      const existing = await MediaLibrary.getAlbumAsync(albumName);
      if (existing) {
        await createAssetInAlbum(item.uri, existing);
        return true;
      }
      await MediaLibrary.createAlbumAsync(albumName, undefined, false, item.uri);
      return true;
    } catch {
      /* fall through to default gallery */
    }
  }

  await MediaLibrary.createAssetAsync(item.uri);
  return true;
}

async function restoreAllToFolder(
  items: RestoreSource[],
  folderName: string
): Promise<{ copiedUris: string[]; failed: number }> {
  const name = sanitizeAlbumName(folderName);
  const copiedUris: string[] = [];
  let failed = 0;
  let album: MediaLibrary.Album | null = null;

  try {
    album = await MediaLibrary.getAlbumAsync(name);
  } catch {
    album = null;
  }

  for (const item of items) {
    try {
      if (!album) {
        album = await MediaLibrary.createAlbumAsync(name, undefined, false, item.uri);
        copiedUris.push(item.uri);
        continue;
      }
      await createAssetInAlbum(item.uri, album);
      copiedUris.push(item.uri);
    } catch {
      failed++;
    }
  }

  return { copiedUris, failed };
}

/**
 * Copy vault files back into Photos / gallery — original albums or a new/named folder.
 */
export async function restoreVaultMediaToGallery(
  items: RestoreSource[],
  target: GalleryRestoreTarget
): Promise<{ copiedUris: string[]; failed: number; permissionDenied: boolean }> {
  const unique = items.filter((item) => typeof item.uri === 'string' && item.uri.length > 0);
  if (unique.length === 0) return { copiedUris: [], failed: 0, permissionDenied: false };
  try {
    const perm = await MediaLibrary.requestPermissionsAsync();
    if (!perm.granted) return { copiedUris: [], failed: unique.length, permissionDenied: true };
  } catch {
    return { copiedUris: [], failed: unique.length, permissionDenied: true };
  }

  if (target.mode === 'folder') {
    return {
      ...(await restoreAllToFolder(unique, target.folderName)),
      permissionDenied: false,
    };
  }

  const copiedUris: string[] = [];
  let failed = 0;
  for (const item of unique) {
    try {
      const ok = await restoreOneToOriginal(item);
      if (ok) copiedUris.push(item.uri);
      else failed++;
    } catch {
      failed++;
    }
  }
  return { copiedUris, failed, permissionDenied: false };
}

export function vaultItemHasOriginalLocation(item: Pick<VaultItem, 'sourceAlbumId' | 'sourceAlbumName'>): boolean {
  return Boolean(item.sourceAlbumId || item.sourceAlbumName?.trim());
}
