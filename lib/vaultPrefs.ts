import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_HIDE_GALLERY = 'vault_pref_hide_gallery_after_import';
const KEY_SHOWCASE_PHOTO = 'vault_pref_showcase_photo';
const KEY_SHOWCASE_VIDEO = 'vault_pref_showcase_video';

export type ShowcaseMode = 'icons' | 'list';
export type ShowcaseScope = 'photo' | 'video';

/** When true (default), importing from the photo library removes the original so it only exists in the vault. */
export async function getHideGalleryAfterImport(): Promise<boolean> {
  const v = await AsyncStorage.getItem(KEY_HIDE_GALLERY);
  return v !== '0';
}

export async function setHideGalleryAfterImport(value: boolean): Promise<void> {
  await AsyncStorage.setItem(KEY_HIDE_GALLERY, value ? '1' : '0');
}

function showcaseKey(scope: ShowcaseScope): string {
  return scope === 'video' ? KEY_SHOWCASE_VIDEO : KEY_SHOWCASE_PHOTO;
}

/** Icons (grid) is the default showcase for photos and videos. */
export async function getShowcaseMode(scope: ShowcaseScope): Promise<ShowcaseMode> {
  const v = await AsyncStorage.getItem(showcaseKey(scope));
  return v === 'list' ? 'list' : 'icons';
}

export async function setShowcaseMode(scope: ShowcaseScope, mode: ShowcaseMode): Promise<void> {
  await AsyncStorage.setItem(showcaseKey(scope), mode);
}
