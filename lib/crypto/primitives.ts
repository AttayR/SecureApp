import QuickCrypto, { argon2, createCipheriv, createDecipheriv, randomBytes } from 'react-native-quick-crypto';

export const { Buffer } = QuickCrypto;
export type Bytes = InstanceType<typeof Buffer>;

export const KEY_BYTES = 32;
export const IV_BYTES = 12;
export const TAG_BYTES = 16;

/** Argon2id cost for turning the PIN into a key-encryption key. Stored with each wrapped key. */
export type KdfParams = {
  /** Memory in KiB. */
  memory: number;
  passes: number;
  parallelism: number;
};

export const DEFAULT_KDF: KdfParams = { memory: 64 * 1024, passes: 3, parallelism: 1 };

export function random(size: number): Bytes {
  return randomBytes(size);
}

/** Wraps a Uint8Array as a Buffer without copying. */
export function toBuffer(bytes: Uint8Array): Bytes {
  return Buffer.from(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength);
}

/** Views a Buffer as a plain Uint8Array without copying (for expo-file-system writes). */
export function toUint8(buf: Bytes): Uint8Array {
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
}

/** Best-effort zeroing of key material we no longer need. */
export function wipe(buf: Bytes | null | undefined): void {
  buf?.fill(0);
}

export function deriveKeyFromPin(pin: string, salt: Bytes, params: KdfParams): Promise<Bytes> {
  return new Promise((resolve, reject) => {
    argon2(
      'argon2id',
      {
        message: Buffer.from(pin, 'utf8'),
        nonce: salt,
        memory: params.memory,
        passes: params.passes,
        parallelism: params.parallelism,
        tagLength: KEY_BYTES,
      },
      (err, key) => (err ? reject(err) : resolve(key))
    );
  });
}

/** AES-256-GCM encrypt. Returns `iv | ciphertext | tag`. */
export function seal(key: Bytes, plaintext: Bytes, aad?: Bytes): Bytes {
  const iv = random(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  if (aad) cipher.setAAD(aad);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, body, cipher.getAuthTag()]);
}

/** AES-256-GCM decrypt of `iv | ciphertext | tag`. Returns null if the data or key is wrong. */
export function open(key: Bytes, sealed: Bytes, aad?: Bytes): Bytes | null {
  if (sealed.length < IV_BYTES + TAG_BYTES) return null;
  const iv = sealed.subarray(0, IV_BYTES);
  const tag = sealed.subarray(sealed.length - TAG_BYTES);
  const body = sealed.subarray(IV_BYTES, sealed.length - TAG_BYTES);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    if (aad) decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]);
  } catch {
    return null;
  }
}
