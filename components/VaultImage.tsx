import FontAwesome from '@expo/vector-icons/FontAwesome';
import React from 'react';
import { ActivityIndicator, Image, type ImageProps, StyleSheet, View } from 'react-native';

import { vaultTheme } from '@/constants/vaultTheme';
import { useVaultFileUri } from '@/hooks/useVaultFileUri';
import type { VaultItem } from '@/types/vault';

type Props = Omit<ImageProps, 'source'> & { item: VaultItem };

/** An image from the vault, decrypted on demand. */
export function VaultImage({ item, style, ...rest }: Props) {
  const { uri, error } = useVaultFileUri(item);

  if (uri) return <Image source={{ uri }} style={style} {...rest} />;

  return (
    <View style={[style, styles.placeholder]}>
      {error ? (
        <FontAwesome name="exclamation-triangle" size={16} color={vaultTheme.danger} />
      ) : (
        <ActivityIndicator size="small" color={vaultTheme.goldMuted} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: vaultTheme.bgDeep },
});
