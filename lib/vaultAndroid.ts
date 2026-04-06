import { NativeModules, Platform } from 'react-native';

export type LaunchableAndroidApp = {
  label: string;
  packageName: string;
};

type VaultAndroidNativeModule = {
  getLaunchableApps(): Promise<LaunchableAndroidApp[]>;
  getVideoThumbnail(sourceUri: string, maxSize: number): Promise<string | null>;
};

const nativeModule: VaultAndroidNativeModule | null =
  Platform.OS === 'android'
    ? ((NativeModules.ARVaultAndroid as VaultAndroidNativeModule | undefined) ?? null)
    : null;

export function hasVaultAndroidNativeModule(): boolean {
  return nativeModule != null;
}

export async function getLaunchableAndroidApps(): Promise<LaunchableAndroidApp[]> {
  if (!nativeModule) {
    return [];
  }

  return nativeModule.getLaunchableApps();
}

export async function getVideoThumbnailUri(
  sourceUri: string,
  maxSize = 360
): Promise<string | null> {
  if (!nativeModule) {
    return null;
  }

  return nativeModule.getVideoThumbnail(sourceUri, maxSize);
}
