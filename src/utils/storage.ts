import type { AppState, Note, Tag, Folder, ExportData } from '@/types';
import {
  initializeEncryption,
  encrypt,
  decrypt,
  getMasterKey,
  type EncryptedData
} from './crypto';

const STORAGE_KEY = 'skrive-state';
const ENCRYPTED_STORAGE_KEY = 'skrive-encrypted';
const VERSION = '2.0.0';

// IndexedDB for encrypted state (localStorage has a ~5MB quota and
// synchronous writes; IndexedDB has neither problem)
const DATA_DB_NAME = 'skrive-data';
const DATA_STORE = 'state';
const STATE_KEY = 'encrypted-state';
// Single-slot recovery key of earlier versions; read, never written
const LEGACY_RECOVERY_KEY = 'encrypted-state-recovery';
const RECOVERY_PREFIX = 'encrypted-state-recovery-';
// Encrypted spill written during pagehide when a debounced save is still
// pending: async IndexedDB writes cannot complete during unload, but
// localStorage.setItem is synchronous (libsodium encrypt resolves in a
// microtask). Read and migrated to IndexedDB on next startup.
const EMERGENCY_KEY = 'skrive-emergency';

export interface StoredState {
  lang: 'no' | 'en';
  notes: Note[];
  tags: Tag[];
  folders: Folder[];
}

interface EncryptedStoredState {
  version: number;
  encrypted: EncryptedData;
}

// A load must distinguish "nothing stored" from "stored but unreadable":
// treating an unreadable blob as first-run would let the next save
// overwrite data that might still be recoverable
export type StorageLoadResult =
  | { status: 'ok'; state: StoredState }
  | { status: 'empty' }
  | { status: 'error' }
  // Storage itself could not be read: nothing may be saved this session
  | { status: 'unavailable' };

function openDataDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATA_DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(DATA_STORE)) {
        db.createObjectStore(DATA_STORE);
      }
    };
  });
}

async function idbGet(key: string): Promise<unknown> {
  const db = await openDataDB();
  const request = db.transaction(DATA_STORE, 'readonly').objectStore(DATA_STORE).get(key);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbWrite(write: (store: IDBObjectStore) => void): Promise<void> {
  const db = await openDataDB();
  const tx = db.transaction(DATA_STORE, 'readwrite');
  write(tx.objectStore(DATA_STORE));
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbSet(key: string, value: unknown): Promise<void> {
  return idbWrite((store) => store.put(value, key));
}

async function idbKeys(): Promise<string[]> {
  const db = await openDataDB();
  const request = db.transaction(DATA_STORE, 'readonly').objectStore(DATA_STORE).getAllKeys();
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result.map(String));
    request.onerror = () => reject(request.error);
  });
}

/**
 * Initialize encryption on app startup
 * Loads existing key from storage or generates a new one
 */
export async function initializeStorage(): Promise<void> {
  await initializeEncryption();
}

function normalizeState(state: StoredState): StoredState {
  return {
    lang: state.lang || 'no',
    notes: state.notes || [],
    tags: state.tags || [],
    folders: state.folders || []
  };
}

async function decryptStoredState(parsed: EncryptedStoredState, key = getMasterKey()): Promise<StoredState> {
  if (!key) {
    throw new Error('No encryption key available');
  }
  const decrypted = await decrypt(parsed.encrypted, key);
  return normalizeState(JSON.parse(decrypted) as StoredState);
}

// Each unreadable blob gets its own key so a later failure or save can
// never destroy an earlier copy
async function preserveRecoveryCopy(blob: unknown): Promise<void> {
  try {
    await idbSet(`${RECOVERY_PREFIX}${Date.now()}-${crypto.randomUUID()}`, blob);
    console.warn('Unreadable stored state preserved as recovery copy');
  } catch (error) {
    console.error('Failed to preserve recovery copy:', error);
  }
}

export async function listRecoveryCopies(): Promise<string[]> {
  try {
    return (await idbKeys()).filter(k => k === LEGACY_RECOVERY_KEY || k.startsWith(RECOVERY_PREFIX));
  } catch {
    return [];
  }
}

// Decrypt every recovery copy that one of the keys opens; returns the
// states and the ids of the copies they came from
export async function readRecoveryCopies(keys: Uint8Array[]): Promise<{ states: StoredState[]; ids: string[] }> {
  const states: StoredState[] = [];
  const ids: string[] = [];
  for (const id of await listRecoveryCopies()) {
    const raw = await idbGet(id);
    let blob: EncryptedStoredState;
    try {
      blob = (typeof raw === 'string' ? JSON.parse(raw) : raw) as EncryptedStoredState;
    } catch {
      continue;
    }
    for (const key of keys) {
      try {
        states.push(await decryptStoredState(blob, key));
        ids.push(id);
        break;
      } catch {
        // Wrong key for this copy; try the next one
      }
    }
  }
  return { states, ids };
}

// The state as stored before notes became Markdown, kept once in case a
// conversion loses something; never shown, never overwritten
const PRE_MARKDOWN_KEY = 'encrypted-state-pre-markdown';

export async function keepPreMarkdownCopy(): Promise<void> {
  try {
    if (await idbGet(PRE_MARKDOWN_KEY)) return;
    const current = await idbGet(STATE_KEY);
    if (current) await idbSet(PRE_MARKDOWN_KEY, current);
  } catch (error) {
    console.warn('Failed to keep pre-Markdown copy:', error);
  }
}

export async function deleteRecoveryCopies(ids: string[]): Promise<void> {
  await idbWrite((store) => ids.forEach(id => store.delete(id)));
}

/**
 * Load state: IndexedDB first, then legacy localStorage (encrypted, then
 * plaintext) for migration. Unreadable data is preserved, never discarded.
 */
export async function loadFromStorageEncrypted(): Promise<StorageLoadResult> {
  // 0. Emergency spill from a previous unload. Only exists if the last
  // session ended with unsaved changes, so it is always newest
  const emergency = localStorage.getItem(EMERGENCY_KEY);
  if (emergency) {
    try {
      const parsed = JSON.parse(emergency) as EncryptedStoredState;
      const state = await decryptStoredState(parsed);
      return { status: 'ok', state };
    } catch (error) {
      console.warn('Failed to read emergency spill, falling back:', error);
      await preserveRecoveryCopy(emergency);
      localStorage.removeItem(EMERGENCY_KEY);
    }
  }

  // 1. IndexedDB (current)
  let idbBlob: unknown = null;
  try {
    idbBlob = await idbGet(STATE_KEY);
  } catch (error) {
    console.error('IndexedDB unavailable:', error);
    return { status: 'unavailable' };
  }
  if (idbBlob) {
    try {
      const state = await decryptStoredState(idbBlob as EncryptedStoredState);
      return { status: 'ok', state };
    } catch (error) {
      console.warn('Failed to decrypt stored state:', error);
      await preserveRecoveryCopy(idbBlob);
      return { status: 'error' };
    }
  }

  // 2. Legacy encrypted localStorage (migrated to IndexedDB on next save)
  const encrypted = localStorage.getItem(ENCRYPTED_STORAGE_KEY);
  if (encrypted) {
    try {
      const parsed = JSON.parse(encrypted) as EncryptedStoredState;
      const state = await decryptStoredState(parsed);
      return { status: 'ok', state };
    } catch (error) {
      console.warn('Failed to decrypt legacy encrypted storage:', error);
      await preserveRecoveryCopy(encrypted);
      return { status: 'error' };
    }
  }

  // 3. Legacy plaintext localStorage (migrated to encrypted on next save)
  const legacy = localStorage.getItem(STORAGE_KEY);
  if (legacy) {
    try {
      return { status: 'ok', state: normalizeState(JSON.parse(legacy) as StoredState) };
    } catch (error) {
      console.warn('Failed to parse legacy storage:', error);
      await preserveRecoveryCopy(legacy);
      return { status: 'error' };
    }
  }

  return { status: 'empty' };
}

/**
 * Save state encrypted to IndexedDB. Returns whether the write succeeded
 * so the UI can show a truthful save status.
 */
export async function saveToStorageEncrypted(state: Pick<AppState, 'lang' | 'notes' | 'tags' | 'folders'>): Promise<boolean> {
  try {
    const toSave: StoredState = {
      lang: state.lang,
      notes: state.notes,
      tags: state.tags,
      folders: state.folders
    };

    const key = getMasterKey();
    if (!key) {
      // Never fall back to writing plaintext; a missing key is an error
      console.error('No encryption key available, state not saved');
      return false;
    }
    const encrypted = await encrypt(JSON.stringify(toSave), key);
    const encryptedState: EncryptedStoredState = {
      version: 1,
      encrypted
    };
    await idbSet(STATE_KEY, encryptedState);

    // Remove legacy copies and any emergency spill after a successful save
    localStorage.removeItem(ENCRYPTED_STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(EMERGENCY_KEY);
    return true;
  } catch (error) {
    console.error('Failed to save to encrypted storage:', error);
    return false;
  }
}

/**
 * Emergency save during pagehide: encrypt (microtask-fast with libsodium)
 * and write synchronously to localStorage
 */
export async function saveEmergencySpill(state: Pick<AppState, 'lang' | 'notes' | 'tags' | 'folders'>): Promise<void> {
  try {
    const key = getMasterKey();
    if (!key) return;
    const encrypted = await encrypt(JSON.stringify({
      lang: state.lang,
      notes: state.notes,
      tags: state.tags,
      folders: state.folders
    }), key);
    const encryptedState: EncryptedStoredState = { version: 1, encrypted };
    localStorage.setItem(EMERGENCY_KEY, JSON.stringify(encryptedState));
  } catch (error) {
    console.warn('Emergency spill failed:', error);
  }
}

export function createExportData(state: Pick<AppState, 'notes' | 'tags' | 'folders'>): ExportData {
  return {
    version: VERSION,
    exportedAt: Date.now(),
    notes: state.notes,
    tags: state.tags,
    folders: state.folders
  };
}

// Import limits to prevent DoS attacks
const MAX_NOTES = 10000;
const MAX_TAGS = 1000;
const MAX_FOLDERS = 1000;
const MAX_NOTE_CONTENT_LENGTH = 1000000; // 1MB per note
const MAX_TITLE_LENGTH = 500;
const MAX_TAG_NAME_LENGTH = 100;
const MAX_FOLDER_NAME_LENGTH = 200;

export function validateImportData(data: unknown): data is ExportData {
  if (!data || typeof data !== 'object') return false;

  const d = data as Record<string, unknown>;

  if (typeof d.version !== 'string') return false;
  if (typeof d.exportedAt !== 'number') return false;
  if (!Array.isArray(d.notes)) return false;
  if (!Array.isArray(d.tags)) return false;
  if (!Array.isArray(d.folders)) return false;

  // Check array size limits
  if (d.notes.length > MAX_NOTES) return false;
  if (d.tags.length > MAX_TAGS) return false;
  if (d.folders.length > MAX_FOLDERS) return false;

  // Validate notes structure and content limits
  for (const note of d.notes) {
    if (!note || typeof note !== 'object') return false;
    const n = note as Record<string, unknown>;
    if (typeof n.id !== 'string') return false;
    if (typeof n.title !== 'string') return false;
    if (typeof n.content !== 'string') return false;
    if (n.title.length > MAX_TITLE_LENGTH) return false;
    if (n.content.length > MAX_NOTE_CONTENT_LENGTH) return false;
  }

  // Validate tags structure and limits
  for (const tag of d.tags) {
    if (!tag || typeof tag !== 'object') return false;
    const t = tag as Record<string, unknown>;
    if (typeof t.id !== 'string') return false;
    if (typeof t.name !== 'string') return false;
    if (t.name.length > MAX_TAG_NAME_LENGTH) return false;
  }

  // Validate folders structure and limits
  for (const folder of d.folders) {
    if (!folder || typeof folder !== 'object') return false;
    const f = folder as Record<string, unknown>;
    if (typeof f.id !== 'string') return false;
    if (typeof f.name !== 'string') return false;
    if (f.name.length > MAX_FOLDER_NAME_LENGTH) return false;
  }

  return true;
}

export function exportToJsonFile(data: ExportData): void {
  const json = JSON.stringify(data, null, 2);
  const filename = `skrive-backup-${new Date().toISOString().split('T')[0]}.json`;
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Maximum file size for import (50MB for JSON, 1MB for single notes)
const MAX_IMPORT_FILE_SIZE = 50 * 1024 * 1024;
const MAX_NOTE_FILE_SIZE = 1 * 1024 * 1024;

export interface ImportedNote {
  title: string;
  content: string;
}

export async function importNoteFromFile(): Promise<ImportedNote | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.md';

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        resolve(null);
        return;
      }

      if (file.size > MAX_NOTE_FILE_SIZE) {
        console.warn('Note file too large:', file.size, 'bytes');
        resolve(null);
        return;
      }

      try {
        const content = await file.text();
        const filename = file.name;
        const title = filename.replace(/\.(txt|md)$/i, '');

        resolve({ title, content });
      } catch (error) {
        console.warn('Failed to read note file:', error);
        resolve(null);
      }
    };

    input.click();
  });
}

export async function importFromJsonFile(): Promise<ExportData | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        resolve(null);
        return;
      }

      // Check file size BEFORE parsing to prevent DoS
      if (file.size > MAX_IMPORT_FILE_SIZE) {
        console.warn('Import file too large:', file.size, 'bytes');
        resolve(null);
        return;
      }

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (validateImportData(data)) {
          resolve(data);
        } else {
          console.warn('Import data validation failed');
          resolve(null);
        }
      } catch (error) {
        console.warn('Failed to parse import file:', error);
        resolve(null);
      }
    };

    input.click();
  });
}
