import type { Note, ExportData, FileSystemDirectoryHandle } from '@/types';
import { getExtensionFromFormat, getMimeTypeFromFormat, htmlToMarkdown, htmlToRtf, markdownToHtml } from './helpers';
import type { EncryptedData, PassphraseWrappedKey } from './crypto';

const DIRECTORY_HANDLE_KEY = 'skrive-directory-handle';
const BACKUP_HANDLE_KEY = 'skrive-backup-handle';
const BACKUP_KEY_PROTECTION_KEY = 'skrive-backup-key-protection';

// Legacy backup format (plaintext notes + plaintext key); still readable
// for restore, never written anymore
export interface LegacyAutoBackupData extends ExportData {
  encryptionKey: string;
  backupTimestamp: number;
}

// Current backup format: payload encrypted with the master key, master key
// wrapped with a passphrase-derived key
export interface EncryptedBackupFile {
  format: 'skrive-encrypted-backup';
  version: number;
  backupTimestamp: number;
  keyProtection: PassphraseWrappedKey;
  payload: EncryptedData;
}

export type AutoBackupReadResult =
  | { kind: 'encrypted'; file: EncryptedBackupFile }
  | { kind: 'legacy'; data: LegacyAutoBackupData };

// IndexedDB for storing directory handle
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('skrive-fs', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('handles')) {
        db.createObjectStore('handles');
      }
    };
  });
}

export async function storeDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction('handles', 'readwrite');
    const store = tx.objectStore('handles');
    store.put(handle, DIRECTORY_HANDLE_KEY);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.warn('Failed to store directory handle in IndexedDB:', error);
  }
}

export async function getStoredDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB();
    const tx = db.transaction('handles', 'readonly');
    const store = tx.objectStore('handles');
    const request = store.get(DIRECTORY_HANDLE_KEY);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('Failed to get directory handle from IndexedDB:', error);
    return null;
  }
}

export async function clearStoredDirectoryHandle(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction('handles', 'readwrite');
    const store = tx.objectStore('handles');
    store.delete(DIRECTORY_HANDLE_KEY);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.warn('Failed to clear directory handle from IndexedDB:', error);
  }
}

export async function requestDirectoryAccess(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await window.showDirectoryPicker({
      mode: 'readwrite'
    });
    await storeDirectoryHandle(handle);
    return handle;
  } catch (error) {
    // User cancelled or permission denied - this is expected behavior
    return null;
  }
}

// Query-only permission check: safe to call without user activation
// (requestPermission without a user gesture is auto-denied by Chrome)
export async function hasStoredPermission(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  try {
    const result = await (handle as FileSystemDirectoryHandle & {
      queryPermission: (options: { mode: string }) => Promise<string>
    }).queryPermission({ mode: 'readwrite' });
    return result === 'granted';
  } catch {
    return false;
  }
}

export async function verifyPermission(
  handle: FileSystemDirectoryHandle,
  readWrite = true
): Promise<boolean> {
  const options: { mode: 'read' | 'readwrite' } = { mode: readWrite ? 'readwrite' : 'read' };
  
  // Check if we already have permission
  if ((await (handle as FileSystemDirectoryHandle & { 
    queryPermission: (options: { mode: string }) => Promise<string> 
  }).queryPermission(options)) === 'granted') {
    return true;
  }
  
  // Request permission
  if ((await (handle as FileSystemDirectoryHandle & { 
    requestPermission: (options: { mode: string }) => Promise<string> 
  }).requestPermission(options)) === 'granted') {
    return true;
  }
  
  return false;
}

export async function saveNoteToDirectory(
  handle: FileSystemDirectoryHandle,
  note: Note
): Promise<boolean> {
  try {
    if (!(await verifyPermission(handle))) {
      return false;
    }
    
    const extension = getExtensionFromFormat(note.format);
    let sanitized = note.title
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/^\.+/, '_')
      .replace(/\s+$/, '');
    // Windows reserved names
    if (/^(CON|PRN|AUX|NUL|COM\d|LPT\d)$/i.test(sanitized)) {
      sanitized = `_${sanitized}`;
    }
    // Max 200 chars for the name (leaving room for extension)
    sanitized = sanitized.slice(0, 200) || 'note';
    const filename = `${sanitized}${extension}`;
    
    const fileHandle = await handle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(note.content);
    await writable.close();
    
    return true;
  } catch (error) {
    console.warn('Failed to save note to directory:', error);
    return false;
  }
}

export async function saveAllNotesToDirectory(
  handle: FileSystemDirectoryHandle,
  notes: Note[]
): Promise<boolean> {
  try {
    if (!(await verifyPermission(handle))) {
      return false;
    }
    
    // Create a skrive subdirectory
    const skriveDir = await handle.getDirectoryHandle('skrive-notes', { create: true });
    
    for (const note of notes) {
      await saveNoteToDirectory(skriveDir, note);
    }

    return true;
  } catch (error) {
    console.warn('Failed to save all notes to directory:', error);
    return false;
  }
}

export async function exportDataToDirectory(
  handle: FileSystemDirectoryHandle,
  data: ExportData
): Promise<boolean> {
  try {
    if (!(await verifyPermission(handle))) {
      return false;
    }
    
    const filename = `skrive-backup-${new Date().toISOString().split('T')[0]}.json`;
    const fileHandle = await handle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();

    return true;
  } catch (error) {
    console.warn('Failed to export data to directory:', error);
    return false;
  }
}

export type ExportFormat = 'native' | 'markdown' | 'rtf' | 'html';

function getExportContent(note: Note, format: ExportFormat): { content: string; extension: string; mimeType: string } {
  let content = note.content || '';
  let extension = getExtensionFromFormat(note.format);
  let mimeType = getMimeTypeFromFormat(note.format);

  // Convert richtext to other formats if requested
  if (note.format === 'richtext') {
    if (format === 'markdown') {
      content = htmlToMarkdown(content);
      extension = '.md';
      mimeType = 'text/markdown';
    } else if (format === 'rtf') {
      content = htmlToRtf(content);
      extension = '.rtf';
      mimeType = 'application/rtf';
    }
  } else if (note.format === 'markdown' && format === 'html') {
    content = markdownToHtml(content);
    extension = '.html';
    mimeType = 'text/html';
  }

  return { content, extension, mimeType };
}

function downloadWithBlob(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadNote(note: Note, format: ExportFormat = 'native'): void {
  const { content, extension, mimeType } = getExportContent(note, format);
  const filename = `${note.title}${extension}`;
  downloadWithBlob(content, filename, mimeType);
}

// Use File System Access API if available, otherwise fall back to download
export async function saveNote(
  note: Note,
  directoryHandle: FileSystemDirectoryHandle | null
): Promise<boolean> {
  if (directoryHandle) {
    return saveNoteToDirectory(directoryHandle, note);
  } else {
    downloadNote(note);
    return true;
  }
}

// Auto-backup handle management

export async function storeBackupHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction('handles', 'readwrite');
    const store = tx.objectStore('handles');
    store.put(handle, BACKUP_HANDLE_KEY);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.warn('Failed to store backup handle in IndexedDB:', error);
  }
}

export async function getStoredBackupHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB();
    const tx = db.transaction('handles', 'readonly');
    const store = tx.objectStore('handles');
    const request = store.get(BACKUP_HANDLE_KEY);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('Failed to get backup handle from IndexedDB:', error);
    return null;
  }
}

export async function clearBackupHandle(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction('handles', 'readwrite');
    const store = tx.objectStore('handles');
    store.delete(BACKUP_HANDLE_KEY);
    store.delete(BACKUP_KEY_PROTECTION_KEY);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.warn('Failed to clear backup handle from IndexedDB:', error);
  }
}

export async function storeBackupKeyProtection(protection: PassphraseWrappedKey): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(protection, BACKUP_KEY_PROTECTION_KEY);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.warn('Failed to store backup key protection in IndexedDB:', error);
  }
}

export async function getStoredBackupKeyProtection(): Promise<PassphraseWrappedKey | null> {
  try {
    const db = await openDB();
    const request = db.transaction('handles', 'readonly').objectStore('handles').get(BACKUP_KEY_PROTECTION_KEY);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('Failed to get backup key protection from IndexedDB:', error);
    return null;
  }
}

export async function requestBackupDirectoryAccess(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await window.showDirectoryPicker({
      id: 'skrive-backup',
      mode: 'readwrite'
    });
    await storeBackupHandle(handle);
    return handle;
  } catch (error) {
    return null;
  }
}

export async function writeAutoBackup(
  handle: FileSystemDirectoryHandle,
  file: EncryptedBackupFile
): Promise<boolean> {
  try {
    // Skip verifyPermission to avoid prompting the user during background saves.
    // If permission was revoked, the write will throw and fail silently.
    const fileHandle = await handle.getFileHandle('skrive-auto-backup.json', { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(file, null, 2));
    await writable.close();
    return true;
  } catch (error) {
    console.warn('Auto-backup write failed:', error);
    return false;
  }
}

export async function readAutoBackup(
  handle: FileSystemDirectoryHandle
): Promise<AutoBackupReadResult | null> {
  try {
    if (!(await verifyPermission(handle))) {
      return null;
    }
    const fileHandle = await handle.getFileHandle('skrive-auto-backup.json');
    const file = await fileHandle.getFile();
    const text = await file.text();
    const data = JSON.parse(text) as Record<string, unknown>;

    if (data.format === 'skrive-encrypted-backup') {
      const encrypted = data as unknown as EncryptedBackupFile;
      if (!encrypted.keyProtection?.wrappedKey || !encrypted.payload?.ciphertext) {
        return null;
      }
      return { kind: 'encrypted', file: encrypted };
    }

    // Legacy plaintext format
    if (typeof data.encryptionKey === 'string' && Array.isArray(data.notes)) {
      return { kind: 'legacy', data: data as unknown as LegacyAutoBackupData };
    }

    return null;
  } catch (error) {
    console.warn('Failed to read auto-backup:', error);
    return null;
  }
}
