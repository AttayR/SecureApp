import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';

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

/**
 * Copy a vault file back into the system photo / video library.
 */
export async function copyVaultFileToGallery(localFileUri: string): Promise<boolean> {
  try {
    const perm = await MediaLibrary.requestPermissionsAsync();
    if (!perm.granted) return false;
    await MediaLibrary.createAssetAsync(localFileUri);
    return true;
  } catch {
    return false;
  }
}
