import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_HIDE_GALLERY = 'vault_pref_hide_gallery_after_import';

/** When true (default), importing from the photo library removes the original so it only exists in the vault. */
export async function getHideGalleryAfterImport(): Promise<boolean> {
  const v = await AsyncStorage.getItem(KEY_HIDE_GALLERY);
  return v !== '0';
}

export async function setHideGalleryAfterImport(value: boolean): Promise<void> {
  await AsyncStorage.setItem(KEY_HIDE_GALLERY, value ? '1' : '0');
}
