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

/**
 * Initialize encryption on app startup
 * Loads existing key from localStorage or generates a new one
 */
export async function initializeStorage(): Promise<void> {
  await initializeEncryption();
}

/**
 * Load state from storage (handles both encrypted and legacy unencrypted)
 */
export async function loadFromStorageEncrypted(): Promise<StoredState | null> {
  try {
    // First try encrypted storage
    const encrypted = localStorage.getItem(ENCRYPTED_STORAGE_KEY);
    if (encrypted) {
      const parsed = JSON.parse(encrypted) as EncryptedStoredState;
      const key = getMasterKey();
      if (key) {
        const decrypted = await decrypt(parsed.encrypted, key);
        const state = JSON.parse(decrypted) as StoredState;
        return {
          lang: state.lang || 'no',
          notes: state.notes || [],
          tags: state.tags || [],
          folders: state.folders || []
        };
      }
    }

    // Fall back to legacy unencrypted storage (for migration)
    const legacy = localStorage.getItem(STORAGE_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as StoredState;
      // Migrate to encrypted storage on next save
      return {
        lang: parsed.lang || 'no',
        notes: parsed.notes || [],
        tags: parsed.tags || [],
        folders: parsed.folders || []
      };
    }
  } catch (error) {
    console.warn('Failed to load storage (corrupted or decryption failed):', error);
  }
  return null;
}

/**
 * Save state to encrypted storage
 */
export async function saveToStorageEncrypted(state: Pick<AppState, 'lang' | 'notes' | 'tags' | 'folders'>): Promise<void> {
  try {
    const toSave: StoredState = {
      lang: state.lang,
      notes: state.notes,
      tags: state.tags,
      folders: state.folders
    };

    const key = getMasterKey();
    if (key) {
      const encrypted = await encrypt(JSON.stringify(toSave), key);
      const encryptedState: EncryptedStoredState = {
        version: 1,
        encrypted
      };
      localStorage.setItem(ENCRYPTED_STORAGE_KEY, JSON.stringify(encryptedState));

      // Remove legacy unencrypted storage after successful encrypted save
      localStorage.removeItem(STORAGE_KEY);
    } else {
      // Fallback to unencrypted if no key
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    }
  } catch (error) {
    console.warn('Failed to save to encrypted storage:', error);
  }
}

/**
 * Legacy synchronous load (for initial render before crypto is ready)
 */
export function loadFromStorage(): StoredState | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as StoredState;
      return {
        lang: parsed.lang || 'no',
        notes: parsed.notes || [],
        tags: parsed.tags || [],
        folders: parsed.folders || []
      };
    }
  } catch (error) {
    console.warn('Failed to load legacy storage:', error);
  }
  return null;
}

/**
 * Legacy synchronous save (deprecated, use saveToStorageEncrypted)
 */
export function saveToStorage(state: Pick<AppState, 'lang' | 'notes' | 'tags' | 'folders'>): void {
  // Call async version but don't await (fire and forget for compatibility)
  saveToStorageEncrypted(state).catch((error) => {
    console.warn('Failed to save storage:', error);
  });
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

export async function exportToJsonFile(data: ExportData): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  const filename = `skrive-backup-${new Date().toISOString().split('T')[0]}.json`;

  // Try File System Access API first (no download log)
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: 'JSON file',
          accept: { 'application/json': ['.json'] }
        }]
      });

      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      return;
    } catch {
      // User cancelled - fall through to blob download
    }
  }

  // Fallback to blob download
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Maximum file size for import (50MB)
const MAX_IMPORT_FILE_SIZE = 50 * 1024 * 1024;

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
