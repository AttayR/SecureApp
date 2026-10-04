import * as Crypto from 'expo-crypto';
import { timingSafeEqual } from 'react-native-quick-crypto';

import { Buffer } from '@/lib/crypto/primitives';

const SEP = ':';

/**
 * Checks a PIN against the salted SHA-256 hash stored by versions before encryption.
 * Only used once, on the first unlock after upgrading; the hash is then deleted and the
 * PIN protects the vault key instead (see lib/crypto/keyStore.ts).
 */
export async function verifyLegacyPin(pin: string, stored: string): Promise<boolean> {
  const i = stored.indexOf(SEP);
  if (i <= 0) return false;
  const salt = stored.slice(0, i);
  const expected = Buffer.from(stored.slice(i + 1), 'hex');
  const actual = Buffer.from(
    await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}${pin}`, {
      encoding: Crypto.CryptoEncoding.HEX,
    }),
    'hex'
  );
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
