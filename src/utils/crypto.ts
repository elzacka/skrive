// Note encryption (AEGIS-256, XChaCha20-Poly1305 fallback) and key storage;
// the design is in CLAUDE.md under Security and Auto-backup

import sodium from 'libsodium-wrappers';

// Type augmentation for AEGIS-256 functions (not in default libsodium types)
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

// Helper to check if AEGIS-256 is available
function hasAegis256Support(s: typeof sodium): s is typeof sodium & SodiumWithAegis {
  return typeof (s as SodiumWithAegis).crypto_aead_aegis256_encrypt === 'function';
}

// Legacy localStorage key (migrated to IndexedDB on startup)
const LEGACY_KEY_STORAGE_KEY = 'skrive-key';

const MASTER_KEY_BYTES = 32;

// Encryption algorithm type
export type EncryptionAlgorithm = 'aegis256' | 'xchacha20';

// Encrypted data structure
export interface EncryptedData {
  algorithm: EncryptionAlgorithm;
  nonce: string;      // base64
  ciphertext: string; // base64
  version: number;    // for future compatibility
}

// Master key wrapped with a passphrase-derived key (for backup files)
export interface PassphraseWrappedKey {
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;       // base64
  iv: string;         // base64
  wrappedKey: string; // base64
  // Fingerprint of the wrapped key, absent in older protections: shows
  // without the passphrase whether the protection still fits the device key
  keyCheck?: string;
}

const PBKDF2_ITERATIONS = 600000;

// Master key stored in memory
let masterKey: Uint8Array | null = null;
let isInitialized = false;
let preferredAlgorithm: EncryptionAlgorithm = 'xchacha20';

/**
 * Initialize libsodium and detect best algorithm
 */
export async function initCrypto(): Promise<void> {
  if (isInitialized) return;

  await sodium.ready;

  // Check if AEGIS-256 is available (requires AES hardware acceleration)
  if (hasAegis256Support(sodium)) {
    preferredAlgorithm = 'aegis256';
  } else {
    preferredAlgorithm = 'xchacha20';
  }

  isInitialized = true;
}

/**
 * Generate a new master key
 */
async function generateMasterKey(): Promise<Uint8Array> {
  await initCrypto();

  // Both AEGIS-256 and XChaCha20-Poly1305 use 256-bit keys
  const key = sodium.crypto_secretbox_keygen();
  return key;
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

function openCryptoDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CRYPTO_DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(CRYPTO_STORE)) {
        db.createObjectStore(CRYPTO_STORE);
      }
    };
  });
}

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

/**
 * Persist the master key: keep it in memory and store it in IndexedDB,
 * wrapped with the non-extractable device wrapping key
 */
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
  return sodium.to_base64(digest, sodium.base64_variants.URLSAFE_NO_PADDING);
}

// null when an older protection has no fingerprint
export async function protectionFitsKey(protection: PassphraseWrappedKey, key: Uint8Array): Promise<boolean | null> {
  if (!protection.keyCheck) return null;
  await initCrypto();
  return protection.keyCheck === await keyFingerprint(key);
}

/**
 * Import key from URL-safe base64 string; throws if it is not a valid
 * 256-bit key
 */
function importKeyFromBase64(base64Key: string): Uint8Array {
  const key = sodium.from_base64(base64Key, sodium.base64_variants.URLSAFE_NO_PADDING);
  if (key.length !== MASTER_KEY_BYTES) {
    throw new Error('Invalid key length');
  }
  return key;
}

// Passphrase wrapping for backup files (WebCrypto PBKDF2 + AES-GCM)

async function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Wrap the master key with a passphrase-derived key (for backup files)
 */
export async function wrapKeyWithPassphrase(
  key: Uint8Array,
  passphrase: string
): Promise<PassphraseWrappedKey> {
  await initCrypto();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const derived = await deriveKeyFromPassphrase(passphrase, salt, PBKDF2_ITERATIONS);
  const wrapped = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, derived, key as BufferSource)
  );
  const b64 = (bytes: Uint8Array) =>
    sodium.to_base64(bytes, sodium.base64_variants.URLSAFE_NO_PADDING);
  return {
    keyCheck: await keyFingerprint(key),
    kdf: 'PBKDF2-SHA256',
    iterations: PBKDF2_ITERATIONS,
    salt: b64(salt),
    iv: b64(iv),
    wrappedKey: b64(wrapped)
  };
}

/**
 * Unwrap a passphrase-wrapped master key; throws on wrong passphrase
 * or corrupted data
 */
export async function unwrapKeyWithPassphrase(
  wrapped: PassphraseWrappedKey,
  passphrase: string
): Promise<Uint8Array> {
  await initCrypto();
  const fromB64 = (value: string) =>
    sodium.from_base64(value, sodium.base64_variants.URLSAFE_NO_PADDING);
  const derived = await deriveKeyFromPassphrase(passphrase, fromB64(wrapped.salt), wrapped.iterations);
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

/**
 * Encrypt data using the preferred algorithm
 */
export async function encrypt(plaintext: string, key?: Uint8Array): Promise<EncryptedData> {
  await initCrypto();

  const encryptionKey = key || masterKey;
  if (!encryptionKey) {
    throw new Error('No encryption key available');
  }

  const plaintextBytes = sodium.from_string(plaintext);

  if (preferredAlgorithm === 'aegis256' && hasAegis256Support(sodium)) {
    return encryptAegis256(plaintextBytes, encryptionKey);
  } else {
    return encryptXChaCha20(plaintextBytes, encryptionKey);
  }
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

  const nonce = sodium.from_base64(encryptedData.nonce, sodium.base64_variants.URLSAFE_NO_PADDING);
  const ciphertext = sodium.from_base64(encryptedData.ciphertext, sodium.base64_variants.URLSAFE_NO_PADDING);

  let plaintext: Uint8Array;

  if (encryptedData.algorithm === 'aegis256') {
    plaintext = decryptAegis256(ciphertext, nonce, decryptionKey);
  } else {
    plaintext = decryptXChaCha20(ciphertext, nonce, decryptionKey);
  }

  return sodium.to_string(plaintext);
}

/**
 * Encrypt using AEGIS-256 (fastest, key-committing)
 */
function encryptAegis256(plaintext: Uint8Array, key: Uint8Array): EncryptedData {
  if (!hasAegis256Support(sodium)) {
    throw new Error('AEGIS-256 not available');
  }

  // AEGIS-256 uses 256-bit (32 byte) nonce
  const nonce = sodium.randombytes_buf(32);

  const ciphertext = sodium.crypto_aead_aegis256_encrypt(
    plaintext,
    null,
    null,
    nonce,
    key
  );

  return {
    algorithm: 'aegis256',
    nonce: sodium.to_base64(nonce, sodium.base64_variants.URLSAFE_NO_PADDING),
    ciphertext: sodium.to_base64(ciphertext, sodium.base64_variants.URLSAFE_NO_PADDING),
    version: 1
  };
}

/**
 * Decrypt using AEGIS-256
 */
function decryptAegis256(ciphertext: Uint8Array, nonce: Uint8Array, key: Uint8Array): Uint8Array {
  if (!hasAegis256Support(sodium)) {
    throw new Error('AEGIS-256 not available');
  }

  const plaintext = sodium.crypto_aead_aegis256_decrypt(
    null,
    ciphertext,
    null,
    nonce,
    key
  );

  if (!plaintext) {
    throw new Error('Decryption failed - invalid ciphertext or key');
  }

  return plaintext;
}

/**
 * Encrypt using XChaCha20-Poly1305 (fallback, constant-time)
 */
function encryptXChaCha20(plaintext: Uint8Array, key: Uint8Array): EncryptedData {
  // XChaCha20-Poly1305 uses 192-bit (24 byte) nonce
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);

  const ciphertext = sodium.crypto_secretbox_easy(plaintext, nonce, key);

  return {
    algorithm: 'xchacha20',
    nonce: sodium.to_base64(nonce, sodium.base64_variants.URLSAFE_NO_PADDING),
    ciphertext: sodium.to_base64(ciphertext, sodium.base64_variants.URLSAFE_NO_PADDING),
    version: 1
  };
}

/**
 * Decrypt using XChaCha20-Poly1305
 */
function decryptXChaCha20(ciphertext: Uint8Array, nonce: Uint8Array, key: Uint8Array): Uint8Array {
  const plaintext = sodium.crypto_secretbox_open_easy(ciphertext, nonce, key);

  if (!plaintext) {
    throw new Error('Decryption failed - invalid ciphertext or key');
  }

  return plaintext;
}

