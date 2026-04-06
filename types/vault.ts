export type VaultCategory = 'photo' | 'audio' | 'video' | 'document';

export type VaultItem = {
  id: string;
  category: VaultCategory;
  name: string;
  /** Path relative to vault root (filename only) */
  fileName: string;
  createdAt: number;
  mimeType?: string;
};

export type VaultAppShortcut = {
  id: string;
  label: string;
  packageName: string;
};
