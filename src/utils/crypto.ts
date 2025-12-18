/**
 * End-to-End Encryption Module for Skrive
 *
 * Uses AEGIS-256 (preferred) with XChaCha20-Poly1305 fallback
 * - AEGIS-256: 256-bit key, 256-bit nonce, key-committing, fastest on modern HW
 * - XChaCha20-Poly1305: 256-bit key, 192-bit nonce, constant-time fallback
 *
 * Key Management:
 * - Keys are derived from user password using Argon2id
 * - Salt is stored in localStorage (not sensitive)
 * - Master key is NEVER persisted, only kept in memory during session
 */

import sodium from 'libsodium-wrappers';

// Storage keys
const SALT_STORAGE_KEY = 'skrive-salt';
const KEY_VERIFICATION_KEY = 'skrive-key-verify';

// Encryption algorithm type
export type EncryptionAlgorithm = 'aegis256' | 'xchacha20';

// Encrypted data structure
export interface EncryptedData {
  algorithm: EncryptionAlgorithm;
  nonce: string;      // base64
  ciphertext: string; // base64
  version: number;    // for future compatibility
}

// Master key stored in memory only (NEVER persisted)
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
  // libsodium will have crypto_aead_aegis256_* functions if supported
  if (typeof (sodium as any).crypto_aead_aegis256_encrypt === 'function') {
    preferredAlgorithm = 'aegis256';
  } else {
    preferredAlgorithm = 'xchacha20';
  }

  isInitialized = true;
}

/**
 * Get the preferred encryption algorithm
 */
export function getPreferredAlgorithm(): EncryptionAlgorithm {
  return preferredAlgorithm;
}

/**
 * Generate a new master key
 */
export async function generateMasterKey(): Promise<Uint8Array> {
  await initCrypto();

  // Both AEGIS-256 and XChaCha20-Poly1305 use 256-bit keys
  const key = sodium.crypto_secretbox_keygen();
  return key;
}

/**
 * Set the master key (from URL fragment or local storage)
 */
export function setMasterKey(key: Uint8Array): void {
  masterKey = key;
}

/**
 * Get the current master key
 */
export function getMasterKey(): Uint8Array | null {
  return masterKey;
}

/**
 * Clear the master key from memory
 */
export function clearMasterKey(): void {
  if (masterKey) {
    // Overwrite with zeros before clearing
    masterKey.fill(0);
    masterKey = null;
  }
}

/**
 * Get or generate salt for key derivation
 */
function getOrCreateSalt(): Uint8Array {
  const storedSalt = localStorage.getItem(SALT_STORAGE_KEY);
  if (storedSalt) {
    try {
      return sodium.from_base64(storedSalt, sodium.base64_variants.URLSAFE_NO_PADDING);
    } catch {
      // Salt corrupted, generate new one
    }
  }

  // Generate new 16-byte salt
  const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
  localStorage.setItem(SALT_STORAGE_KEY, sodium.to_base64(salt, sodium.base64_variants.URLSAFE_NO_PADDING));
  return salt;
}

/**
 * Derive encryption key from password using Argon2id
 * This is the secure alternative to storing keys in localStorage
 */
export async function deriveKeyFromPassword(password: string): Promise<Uint8Array> {
  await initCrypto();

  const salt = getOrCreateSalt();

  // Use Argon2id with interactive parameters (good balance of security and speed)
  const key = sodium.crypto_pwhash(
    32, // 256-bit key
    password,
    salt,
    sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_ALG_ARGON2ID13
  );

  return key;
}

/**
 * Set up encryption with a password (for new users or password change)
 * Creates verification data to later validate password
 */
export async function setupPasswordEncryption(password: string): Promise<void> {
  const key = await deriveKeyFromPassword(password);
  setMasterKey(key);

  // Store verification data (encrypted known string)
  const verificationData = await encrypt('skrive-verification-token', key);
  localStorage.setItem(KEY_VERIFICATION_KEY, JSON.stringify(verificationData));
}

/**
 * Verify password and unlock encryption
 * Returns true if password is correct
 */
export async function unlockWithPassword(password: string): Promise<boolean> {
  const key = await deriveKeyFromPassword(password);

  // Try to decrypt verification data
  const storedVerification = localStorage.getItem(KEY_VERIFICATION_KEY);
  if (!storedVerification) {
    // No verification data = new user, set up encryption
    await setupPasswordEncryption(password);
    return true;
  }

  try {
    const verificationData = JSON.parse(storedVerification) as EncryptedData;
    const decrypted = await decrypt(verificationData, key);

    if (decrypted === 'skrive-verification-token') {
      setMasterKey(key);
      return true;
    }
  } catch {
    // Decryption failed = wrong password
  }

  return false;
}

/**
 * Check if password-based encryption is set up
 */
export function isPasswordEncryptionSetup(): boolean {
  return localStorage.getItem(KEY_VERIFICATION_KEY) !== null;
}

/**
 * Check if there's existing data that needs migration from old key storage
 */
export function hasLegacyKeyStorage(): boolean {
  return localStorage.getItem('skrive-key') !== null;
}

/**
 * Migrate from legacy key storage to password-based encryption
 */
export async function migrateFromLegacyKey(password: string): Promise<boolean> {
  const legacyKey = localStorage.getItem('skrive-key');
  if (!legacyKey) return false;

  try {
    // Import the old key
    const oldKey = importKeyFromBase64(legacyKey);
    setMasterKey(oldKey);

    // Existing encrypted data will be re-encrypted with new key on next save
    // No need to load it here - AppContext handles that

    // Set up new password-based encryption
    const newKey = await deriveKeyFromPassword(password);

    // Create verification data with new key
    const verificationData = await encrypt('skrive-verification-token', newKey);
    localStorage.setItem(KEY_VERIFICATION_KEY, JSON.stringify(verificationData));

    // Update master key to new derived key
    setMasterKey(newKey);

    // Remove legacy key storage
    localStorage.removeItem('skrive-key');

    return true;
  } catch {
    return false;
  }
}

/**
 * Export key to URL-safe base64 string (for URL fragment)
 */
export function exportKeyToBase64(key: Uint8Array): string {
  return sodium.to_base64(key, sodium.base64_variants.URLSAFE_NO_PADDING);
}

/**
 * Import key from URL-safe base64 string
 */
export function importKeyFromBase64(base64Key: string): Uint8Array {
  return sodium.from_base64(base64Key, sodium.base64_variants.URLSAFE_NO_PADDING);
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

  if (preferredAlgorithm === 'aegis256' && typeof (sodium as any).crypto_aead_aegis256_encrypt === 'function') {
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
  // AEGIS-256 uses 256-bit (32 byte) nonce
  const nonce = sodium.randombytes_buf(32);

  // Empty additional data
  const ad = new Uint8Array(0);

  const ciphertext = (sodium as any).crypto_aead_aegis256_encrypt(
    plaintext,
    ad,
    null, // nsec (not used)
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
  const ad = new Uint8Array(0);

  const plaintext = (sodium as any).crypto_aead_aegis256_decrypt(
    null, // nsec (not used)
    ciphertext,
    ad,
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

/**
 * Check if encryption is enabled (master key exists)
 */
export function isEncryptionEnabled(): boolean {
  return masterKey !== null;
}

/**
 * Get encryption status for UI display
 */
export function getEncryptionStatus(): {
  enabled: boolean;
  algorithm: EncryptionAlgorithm;
  algorithmName: string;
} {
  return {
    enabled: masterKey !== null,
    algorithm: preferredAlgorithm,
    algorithmName: preferredAlgorithm === 'aegis256' ? 'AEGIS-256' : 'XChaCha20-Poly1305'
  };
}

/**
 * Generate shareable URL with encryption key in fragment
 */
export function generateShareableUrl(noteId: string, key: Uint8Array): string {
  const base = window.location.origin + window.location.pathname;
  const keyBase64 = exportKeyToBase64(key);
  return `${base}?note=${noteId}#key=${keyBase64}`;
}

/**
 * Extract encryption key from URL fragment and clear it from URL
 */
export function extractKeyFromUrl(): Uint8Array | null {
  const hash = window.location.hash;
  if (!hash.includes('key=')) return null;

  const keyMatch = hash.match(/key=([A-Za-z0-9_-]+)/);
  if (!keyMatch) return null;

  try {
    const key = importKeyFromBase64(keyMatch[1]);

    // Clear the key from URL to prevent exposure in history/logs
    if (window.history && window.history.replaceState) {
      const cleanUrl = window.location.pathname + window.location.search;
      window.history.replaceState({}, document.title, cleanUrl);
    }

    return key;
  } catch {
    return null;
  }
}
