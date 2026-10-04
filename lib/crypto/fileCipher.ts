/**
 * Streaming file encryption (format "ARV1").
 *
 * Every file gets its own random 256-bit file key, wrapped by the vault key in the header.
 * The content is split into 1 MiB chunks, each sealed with AES-256-GCM:
 *
 *   header (80 bytes)
 *     0  magic "ARV1"            4
 *     4  version (1)             1
 *     5  reserved                3
 *     8  chunk size (u32 BE)     4
 *    12  plaintext length (u64)  8
 *    20  wrapped file key       60   = seal(vaultKey, fileKey, aad = header[0..20])
 *   chunks
 *     ciphertext | 16-byte tag, nonce = 0x00000000 | u64 index,
 *     aad = header[0..20] | u64 index | isLast
 *
 * Binding the index and an "is last" flag into every chunk means reordered, dropped or
 * truncated chunks fail authentication. Large files never have to fit in memory.
 */
import { File } from 'expo-file-system';
import { createCipheriv, createDecipheriv } from 'react-native-quick-crypto';

import { Buffer, type Bytes, KEY_BYTES, open, random, seal, TAG_BYTES, toBuffer, toUint8, wipe } from './primitives';

const MAGIC = Buffer.from('ARV1', 'ascii');
const VERSION = 1;
const CHUNK_SIZE = 1024 * 1024;
const PREFIX_BYTES = 20;
const WRAPPED_KEY_BYTES = 12 + KEY_BYTES + TAG_BYTES;
export const HEADER_BYTES = PREFIX_BYTES + WRAPPED_KEY_BYTES;

export type Progress = (done: number, total: number) => void;

/** A vault file that is not ours, uses another key, or failed authentication. */
export class VaultFileError extends Error {}

/** Lets the UI breathe between chunks; the file and crypto calls are synchronous JSI. */
const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function writeU64(buf: Bytes, offset: number, value: number): void {
  buf.writeUInt32BE(Math.floor(value / 2 ** 32), offset);
  buf.writeUInt32BE(value >>> 0, offset + 4);
}

function readU64(buf: Bytes, offset: number): number {
  return buf.readUInt32BE(offset) * 2 ** 32 + buf.readUInt32BE(offset + 4);
}

function chunkNonce(index: number): Bytes {
  const nonce = Buffer.alloc(12);
  writeU64(nonce, 4, index);
  return nonce;
}

function chunkAad(prefix: Bytes, index: number, isLast: boolean): Bytes {
  const aad = Buffer.alloc(PREFIX_BYTES + 9);
  prefix.copy(aad, 0, 0, PREFIX_BYTES);
  writeU64(aad, PREFIX_BYTES, index);
  aad[PREFIX_BYTES + 8] = isLast ? 1 : 0;
  return aad;
}

function chunkCount(length: number, chunkSize: number): number {
  return Math.max(1, Math.ceil(length / chunkSize));
}

type Header = { prefix: Bytes; chunkSize: number; length: number; fileKey: Bytes };

function parseHeader(raw: Bytes, vaultKey: Bytes): Header {
  if (raw.length < HEADER_BYTES || !raw.subarray(0, 4).equals(MAGIC) || raw[4] !== VERSION) {
    throw new VaultFileError('Not an encrypted vault file.');
  }
  const prefix = Buffer.from(raw.subarray(0, PREFIX_BYTES));
  const fileKey = open(vaultKey, raw.subarray(PREFIX_BYTES, HEADER_BYTES), prefix);
  if (!fileKey || fileKey.length !== KEY_BYTES) {
    throw new VaultFileError('This file was encrypted with a different key.');
  }
  return { prefix, chunkSize: raw.readUInt32BE(8), length: readU64(raw, 12), fileKey };
}

/** True if the file starts with the ARV1 header (cheap; does not check the key). */
export function isEncryptedFile(uri: string): boolean {
  const file = new File(uri);
  if (!file.exists || file.size < HEADER_BYTES) return false;
  const handle = file.open();
  try {
    const head = toBuffer(handle.readBytes(5));
    return head.subarray(0, 4).equals(MAGIC) && head[4] === VERSION;
  } finally {
    handle.close();
  }
}

function createEmpty(uri: string): File {
  const file = new File(uri);
  if (file.exists) file.delete();
  file.create();
  return file;
}

/** Encrypts `sourceUri` (a local file:// URI) into a new file at `destUri`. */
export async function encryptFile(
  sourceUri: string,
  destUri: string,
  vaultKey: Bytes,
  onProgress?: Progress
): Promise<void> {
  const source = new File(sourceUri);
  if (!source.exists) throw new Error('Source file not found.');
  const length = source.size;

  const prefix = Buffer.alloc(PREFIX_BYTES);
  MAGIC.copy(prefix, 0);
  prefix[4] = VERSION;
  prefix.writeUInt32BE(CHUNK_SIZE, 8);
  writeU64(prefix, 12, length);

  const fileKey = random(KEY_BYTES);
  const dest = createEmpty(destUri);
  const input = source.open();
  const output = dest.open();
  try {
    output.writeBytes(toUint8(Buffer.concat([prefix, seal(vaultKey, fileKey, prefix)])));

    const count = chunkCount(length, CHUNK_SIZE);
    let done = 0;
    for (let i = 0; i < count; i++) {
      const plain = toBuffer(input.readBytes(Math.min(CHUNK_SIZE, length - done)));
      const cipher = createCipheriv('aes-256-gcm', fileKey, chunkNonce(i));
      cipher.setAAD(chunkAad(prefix, i, i === count - 1));
      output.writeBytes(toUint8(Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()])));
      done += plain.length;
      onProgress?.(done, length);
      await yieldToUi();
    }
    if (done !== length) throw new Error('Source file changed while it was being encrypted.');
  } catch (error) {
    output.close();
    dest.delete();
    throw error;
  } finally {
    wipe(fileKey);
    input.close();
    try {
      output.close();
    } catch {
      /* already closed */
    }
  }
}

/**
 * Decrypts `sourceUri` into `destUri`, or only authenticates it when `destUri` is null.
 * Throws if any chunk fails authentication; a partial output file is deleted.
 */
export async function decryptFile(
  sourceUri: string,
  destUri: string | null,
  vaultKey: Bytes,
  onProgress?: Progress
): Promise<void> {
  const source = new File(sourceUri);
  const input = source.open();
  const dest = destUri ? createEmpty(destUri) : null;
  const output = dest?.open() ?? null;
  let header: Header | null = null;
  try {
    header = parseHeader(toBuffer(input.readBytes(HEADER_BYTES)), vaultKey);
    const { prefix, chunkSize, length, fileKey } = header;
    const count = chunkCount(length, chunkSize);
    if (source.size !== HEADER_BYTES + length + count * TAG_BYTES) {
      throw new VaultFileError('Encrypted file is truncated or corrupted.');
    }

    let done = 0;
    for (let i = 0; i < count; i++) {
      const plainLen = Math.min(chunkSize, length - done);
      const sealed = toBuffer(input.readBytes(plainLen + TAG_BYTES));
      const decipher = createDecipheriv('aes-256-gcm', fileKey, chunkNonce(i));
      decipher.setAAD(chunkAad(prefix, i, i === count - 1));
      decipher.setAuthTag(sealed.subarray(plainLen));
      const plain = Buffer.concat([decipher.update(sealed.subarray(0, plainLen)), decipher.final()]);
      output?.writeBytes(toUint8(plain));
      done += plainLen;
      onProgress?.(done, length);
      await yieldToUi();
    }
  } catch (error) {
    output?.close();
    if (dest?.exists) dest.delete();
    throw error instanceof VaultFileError
      ? error
      : new VaultFileError('Encrypted file failed its integrity check.');
  } finally {
    wipe(header?.fileKey);
    input.close();
    try {
      output?.close();
    } catch {
      /* already closed */
    }
  }
}

/**
 * Re-wraps the file key in the header from `oldKey` to `newKey`, leaving the content as is.
 * Used when restoring a backup that was made with a different vault key.
 */
export function rewrapFileKey(uri: string, oldKey: Bytes, newKey: Bytes): void {
  const file = new File(uri);
  const handle = file.open();
  let header: Header | null = null;
  try {
    header = parseHeader(toBuffer(handle.readBytes(HEADER_BYTES)), oldKey);
    handle.offset = PREFIX_BYTES;
    handle.writeBytes(toUint8(seal(newKey, header.fileKey, header.prefix)));
  } finally {
    wipe(header?.fileKey);
    handle.close();
  }
}

/** Small-payload helpers (index files): `ARV1` blobs sealed directly with the vault key. */
const BLOB_AAD = Buffer.from('ar-vault/blob/v1', 'utf8');

export function sealText(text: string, vaultKey: Bytes): string {
  return seal(vaultKey, Buffer.from(text, 'utf8'), BLOB_AAD).toString('base64');
}

export function openText(base64: string, vaultKey: Bytes): string | null {
  const plain = open(vaultKey, Buffer.from(base64, 'base64'), BLOB_AAD);
  return plain ? plain.toString('utf8') : null;
}
