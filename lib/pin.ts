import * as Crypto from 'expo-crypto';

const SEP = ':';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return globalThis.btoa(binary);
}

export async function hashPin(pin: string): Promise<string> {
  const saltBytes = await Crypto.getRandomBytesAsync(16);
  const salt = bytesToBase64(saltBytes);
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}${pin}`,
    { encoding: Crypto.CryptoEncoding.HEX }
  );
  return `${salt}${SEP}${hash}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const i = stored.indexOf(SEP);
  if (i <= 0) return false;
  const salt = stored.slice(0, i);
  const expected = stored.slice(i + 1);
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}${pin}`,
    { encoding: Crypto.CryptoEncoding.HEX }
  );
  return hash === expected;
}
