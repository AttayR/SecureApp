export type VaultCategory = 'photo' | 'audio' | 'video' | 'document';

export type VaultItem = {
  id: string;
  category: VaultCategory;
  name: string;
  /** Path relative to vault root (filename only) */
  fileName: string;
  createdAt: number;
  mimeType?: string;
  /** True once the file on disk is in the encrypted ARV1 format. Missing on items from older versions. */
  encrypted?: boolean;
};

export type VaultAppShortcut = {
  id: string;
  label: string;
  packageName: string;
};
