export type VaultCategory = 'photo' | 'audio' | 'video' | 'document';

export type VaultItem = {
  id: string;
  category: VaultCategory;
  name: string;
  /** Path relative to vault root (filename only) */
  fileName: string;
  createdAt: number;
  mimeType?: string;
  /** Media library album id from import, used to restore to the original gallery folder. */
  sourceAlbumId?: string;
  /** Human-readable album / folder name from import. */
  sourceAlbumName?: string;
};

export type GalleryRestoreTarget =
  | { mode: 'original' }
  | { mode: 'folder'; folderName: string };

export type VaultAppShortcut = {
  id: string;
  label: string;
  packageName: string;
};
