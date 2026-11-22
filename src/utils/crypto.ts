// Note encryption (AEGIS-256) and key storage; the design is in CLAUDE.md
// under Security and Auto-backup

import sodium from 'libsodium-wrappers-sumo';
import { openDb } from './idb';

// AEGIS-256 is in the bundled build but not in its type definitions
interface SodiumWithAegis {
  crypto_aead_aegis256_encrypt(
    message: Uint8Array,
    additional_data: Uint8Array | null,
    secret_nonce: null,
    public_nonce: Uint8Array,
    key: Uint8Array
  ): Uint8Array;
  crypto_aead_aegis256_decrypt(
    secret_nonce: null,
    ciphertext: Uint8Array,
    additional_data: Uint8Array | null,
    public_nonce: Uint8Array,
    key: Uint8Array
  ): Uint8Array | null;
}

const aegis = () => sodium as typeof sodium & SodiumWithAegis;

// Legacy localStorage key (migrated to IndexedDB on startup)
const LEGACY_KEY_STORAGE_KEY = 'skrive-key';

const MASTER_KEY_BYTES = 32;

// 'xchacha20' marks older data sealed with crypto_secretbox (XSalsa20-Poly1305)
export type EncryptionAlgorithm = 'aegis256' | 'xchacha20';

// Encrypted data structure
export interface EncryptedData {
  algorithm: EncryptionAlgorithm;
  nonce: string;      // base64
  ciphertext: string; // base64
  version: number;    // for future compatibility
}

// Master key wrapped with a passphrase-derived key (for backup files).
// New protections use Argon2id; PBKDF2 ones stay readable
type KdfCost =
  | { kdf: 'Argon2id'; opslimit: number; memlimit: number }
  | { kdf: 'PBKDF2-SHA256'; iterations: number };

export type PassphraseWrappedKey = KdfCost & {
  salt: string;       // base64
  iv: string;         // base64
  wrappedKey: string; // base64
  // Fingerprint of the wrapped key, absent in older protections: shows
  // without the passphrase whether the protection still fits the device key
  keyCheck?: string;
};

// Above OWASP's Argon2id minimum (19 MiB, 2 passes); about 0.1 s in WASM
const ARGON2_OPSLIMIT = 3;
const ARGON2_MEMLIMIT = 64 * 1024 * 1024;
// Bounds on the cost a backup file may ask for: too low is weak, too high
// stalls the tab
const MAX_ARGON2_OPSLIMIT = 10;
const MAX_ARGON2_MEMLIMIT = 256 * 1024 * 1024;
const PBKDF2_ITERATIONS = 600000;
// OWASP ASVS minimum for a secret that is the only factor
export const MIN_PASSPHRASE_LENGTH = 15;
const MAX_PBKDF2_ITERATIONS = 2000000;

const toB64 = (bytes: Uint8Array) => sodium.to_base64(bytes, sodium.base64_variants.URLSAFE_NO_PADDING);
const fromB64 = (value: string) => sodium.from_base64(value, sodium.base64_variants.URLSAFE_NO_PADDING);

// Master key stored in memory
let masterKey: Uint8Array | null = null;

export async function initCrypto(): Promise<void> {
  await sodium.ready;
}

async function generateMasterKey(): Promise<Uint8Array> {
  await initCrypto();
  return sodium.randombytes_buf(MASTER_KEY_BYTES);
}

/**
 * Get the current master key
 */
export function getMasterKey(): Uint8Array | null {
  return masterKey;
}

// IndexedDB storage for the wrapped master key

const CRYPTO_DB_NAME = 'skrive-crypto';
const CRYPTO_STORE = 'keys';
const WRAPPING_KEY_ID = 'wrapping-key';
const WRAPPED_MASTER_KEY_ID = 'wrapped-master-key';

interface WrappedMasterKeyRecord {
  iv: Uint8Array;
  data: Uint8Array;
}

const openCryptoDb = () => openDb(CRYPTO_DB_NAME, CRYPTO_STORE);

function dbGet<T>(db: IDBDatabase, key: string): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(CRYPTO_STORE, 'readonly').objectStore(CRYPTO_STORE).get(key);
    request.onsuccess = () => resolve((request.result as T) ?? null);
    request.onerror = () => reject(request.error);
  });
}

function dbPut(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CRYPTO_STORE, 'readwrite');
    tx.objectStore(CRYPTO_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getOrCreateWrappingKey(db: IDBDatabase): Promise<CryptoKey> {
  const existing = await dbGet<CryptoKey>(db, WRAPPING_KEY_ID);
  if (existing) return existing;

  // Non-extractable: the key material can be used but never read out
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  await dbPut(db, WRAPPING_KEY_ID, key);
  return key;
}

// Keep the master key in memory and in IndexedDB, wrapped with the
// non-extractable device wrapping key
async function persistMasterKey(key: Uint8Array): Promise<void> {
  const db = await openCryptoDb();
  const wrappingKey = await getOrCreateWrappingKey(db);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrappingKey, key as BufferSource)
  );
  await dbPut(db, WRAPPED_MASTER_KEY_ID, { iv, data } satisfies WrappedMasterKeyRecord);
  // Only after the write: data saved with a key that was never stored
  // would be unreadable on the next start
  masterKey = key;
}

// Last resort for a key that can never be read: the record is kept under
// a dated id, never deleted, and a new key is created on the next start
export async function setAsideUnreadableKey(): Promise<void> {
  const db = await openCryptoDb();
  const record = await dbGet<WrappedMasterKeyRecord>(db, WRAPPED_MASTER_KEY_ID);
  const wrappingKey = await dbGet<CryptoKey>(db, WRAPPING_KEY_ID).catch(() => null);
  const stamp = Date.now();
  const tx = db.transaction(CRYPTO_STORE, 'readwrite');
  const store = tx.objectStore(CRYPTO_STORE);
  if (record) store.put(record, `${WRAPPED_MASTER_KEY_ID}-${stamp}`);
  if (wrappingKey) store.put(wrappingKey, `${WRAPPING_KEY_ID}-${stamp}`);
  store.delete(WRAPPED_MASTER_KEY_ID);
  store.delete(WRAPPING_KEY_ID);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// null only when no key has ever been stored; a stored key that cannot be
// read throws, so the caller never replaces it with a new one
async function loadMasterKeyFromDb(): Promise<Uint8Array | null> {
  const db = await openCryptoDb();
  const record = await dbGet<WrappedMasterKeyRecord>(db, WRAPPED_MASTER_KEY_ID);
  if (!record) return null;
  const wrappingKey = await dbGet<CryptoKey>(db, WRAPPING_KEY_ID);
  if (!wrappingKey) throw new Error('Wrapping key missing for stored master key');
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: record.iv as BufferSource },
    wrappingKey,
    record.data as BufferSource
  );
  return new Uint8Array(plain);
}

// Throws when a stored key cannot be read: a new key there would make
// every saved note unreadable
export async function initializeEncryption(): Promise<'loaded' | 'created'> {
  await initCrypto();

  const stored = await loadMasterKeyFromDb();
  if (stored) {
    masterKey = stored;
    return 'loaded';
  }

  const legacyKey = localStorage.getItem(LEGACY_KEY_STORAGE_KEY);
  if (legacyKey) {
    await persistMasterKey(importKeyFromBase64(legacyKey));
    localStorage.removeItem(LEGACY_KEY_STORAGE_KEY);
    return 'loaded';
  }

  await persistMasterKey(await generateMasterKey());
  return 'created';
}

// SHA-256 of a random 256-bit key reveals nothing usable about it
async function keyFingerprint(key: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', key as BufferSource));
  return toB64(digest);
}

// null when an older protection has no fingerprint
export async function protectionFitsKey(protection: PassphraseWrappedKey, key: Uint8Array): Promise<boolean | null> {
  if (!protection.keyCheck) return null;
  await initCrypto();
  return protection.keyCheck === await keyFingerprint(key);
}

// Throws if the URL-safe base64 string is not a valid 256-bit key
function importKeyFromBase64(base64Key: string): Uint8Array {
  const key = fromB64(base64Key);
  if (key.length !== MASTER_KEY_BYTES) {
    throw new Error('Invalid key length');
  }
  return key;
}

// Passphrase wrapping for backup files (Argon2id or PBKDF2, then AES-GCM)

async function aesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

// Throws on a cost outside the bounds, before any work is done
async function deriveKeyFromPassphrase(passphrase: string, salt: Uint8Array, p: KdfCost): Promise<CryptoKey> {
  if (p.kdf === 'Argon2id') {
    if (!(p.opslimit >= ARGON2_OPSLIMIT && p.opslimit <= MAX_ARGON2_OPSLIMIT && p.memlimit >= ARGON2_MEMLIMIT && p.memlimit <= MAX_ARGON2_MEMLIMIT)) {
      throw new Error('Argon2id cost out of bounds');
    }
    return aesKey(sodium.crypto_pwhash(32, passphrase, salt, p.opslimit, p.memlimit, sodium.crypto_pwhash_ALG_ARGON2ID13));
  }
  if (p.kdf !== 'PBKDF2-SHA256' || !(p.iterations >= PBKDF2_ITERATIONS && p.iterations <= MAX_PBKDF2_ITERATIONS)) {
    throw new Error('Unsupported key derivation');
  }
  const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: p.iterations },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function wrapKeyWithPassphrase(key: Uint8Array, passphrase: string): Promise<PassphraseWrappedKey> {
  await initCrypto();
  const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cost = { kdf: 'Argon2id', opslimit: ARGON2_OPSLIMIT, memlimit: ARGON2_MEMLIMIT } as const;
  const derived = await deriveKeyFromPassphrase(passphrase, salt, cost);
  const wrapped = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, derived, key as BufferSource));
  return { keyCheck: await keyFingerprint(key), ...cost, salt: toB64(salt), iv: toB64(iv), wrappedKey: toB64(wrapped) };
}

// Throws on a wrong passphrase, corrupted data or an unsupported cost
export async function unwrapKeyWithPassphrase(wrapped: PassphraseWrappedKey, passphrase: string): Promise<Uint8Array> {
  await initCrypto();
  const derived = await deriveKeyFromPassphrase(passphrase, fromB64(wrapped.salt), wrapped);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(wrapped.iv) as BufferSource },
    derived,
    fromB64(wrapped.wrappedKey) as BufferSource
  );
  const key = new Uint8Array(plain);
  if (key.length !== MASTER_KEY_BYTES) {
    throw new Error('Invalid key length');
  }
  return key;
}

export async function encrypt(plaintext: string, key?: Uint8Array): Promise<EncryptedData> {
  await initCrypto();

  const encryptionKey = key || masterKey;
  if (!encryptionKey) {
    throw new Error('No encryption key available');
  }

  return encryptAegis256(sodium.from_string(plaintext), encryptionKey);
}

/**
 * Decrypt data
 */
export async function decrypt(encryptedData: EncryptedData, key?: Uint8Array): Promise<string> {
  await initCrypto();

  const decryptionKey = key || masterKey;
  if (!decryptionKey) {
    throw new Error('No decryption key available');
  }

  const nonce = fromB64(encryptedData.nonce);
  const ciphertext = fromB64(encryptedData.ciphertext);
  const plaintext = encryptedData.algorithm === 'aegis256'
    ? aegis().crypto_aead_aegis256_decrypt(null, ciphertext, null, nonce, decryptionKey)
    : sodium.crypto_secretbox_open_easy(ciphertext, nonce, decryptionKey);
  if (!plaintext) {
    throw new Error('Decryption failed - invalid ciphertext or key');
  }
  return sodium.to_string(plaintext);
}

// AEGIS-256: key-committing, with a random 256-bit nonce
function encryptAegis256(plaintext: Uint8Array, key: Uint8Array): EncryptedData {
  const nonce = sodium.randombytes_buf(32);
  const ciphertext = aegis().crypto_aead_aegis256_encrypt(plaintext, null, null, nonce, key);
  return { algorithm: 'aegis256', nonce: toB64(nonce), ciphertext: toB64(ciphertext), version: 1 };
}
