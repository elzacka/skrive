import type { Note, Folder, ExportData, FileSystemDirectoryHandle } from '@/types';
import { escapeHtml } from './helpers';
import { markdownToHtml } from './markdown';
import type { EncryptedData, PassphraseWrappedKey } from './crypto';
import { MAX_IMPORT_FILE_SIZE } from './storage';
import { openDb } from './idb';

const BACKUP_HANDLE_KEY = 'skrive-backup-handle';
const BACKUP_KEY_PROTECTION_KEY = 'skrive-backup-key-protection';
const BACKUP_FILE = 'skrive-auto-backup.json';
const SNAPSHOT_PREFIX = 'skrive-auto-backup-';
const SNAPSHOTS_KEPT = 10;

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
const openDB = () => openDb('skrive-fs', 'handles');

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

export type ExportFormat = 'markdown' | 'html';

function getExportContent(note: Note, format: ExportFormat): { content: string; extension: string; mimeType: string } {
  if (format === 'html') {
    const body = markdownToHtml(note.content || '');
    const title = escapeHtml(note.title);
    return {
      content: `<!doctype html>\n<html>\n<head>\n<meta charset="utf-8">\n<title>${title}</title>\n</head>\n<body>\n${body}\n</body>\n</html>\n`,
      extension: '.html',
      mimeType: 'text/html'
    };
  }
  return { content: note.content || '', extension: '.md', mimeType: 'text/markdown' };
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

export function downloadNote(note: Note, format: ExportFormat = 'markdown'): void {
  const { content, extension, mimeType } = getExportContent(note, format);
  downloadWithBlob(content, safeName(note.title, 'note', new Set(), extension), mimeType);
}

// A name every file system accepts; case-insensitive file systems (macOS,
// Windows) need the comparison in lower case
function safeName(name: string, fallback: string, taken: Set<string>, extension = ''): string {
  // Cut before trimming: a name may not end in a dot or space
  let base = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim().slice(0, 120).replace(/[. ]+$/, '') || fallback;
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(base)) base += '_';
  let candidate = base + extension;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${base} ${n}${extension}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

// Every note as a .md file, folders as folders, in a new dated folder inside
// the chosen one so nothing there is overwritten. Returns the folder name,
// or null when the user cancels
export async function exportNotesToFolder(notes: Note[], folders: Folder[], untitled: string): Promise<string | null> {
  let parent: FileSystemDirectoryHandle;
  try {
    parent = await window.showDirectoryPicker({ id: 'skrive-export', mode: 'readwrite' });
  } catch {
    return null;
  }
  const taken = new Set<string>();
  for await (const name of parent.keys()) taken.add(name.toLowerCase());
  const rootName = safeName(`Skrive ${fileStamp(Date.now())}`, 'Skrive', taken);
  const root = await parent.getDirectoryHandle(rootName, { create: true });

  // A note whose folder is missing goes to the top level, not missing
  const known = new Set(folders.map(f => f.id));
  const folderOf = (note: Note) => note.parentId !== null && known.has(note.parentId) ? note.parentId : null;
  const writeLevel = async (dir: FileSystemDirectoryHandle, parentId: string | null) => {
    const names = new Set<string>();
    // A name the browser still refuses falls back to the untitled name
    const open = <T>(name: string, extension: string, get: (n: string) => Promise<T>) =>
      get(safeName(name, untitled, names, extension)).catch(() => get(safeName(untitled, untitled, names, extension)));
    for (const folder of folders.filter(f => f.parentId === parentId)) {
      const sub = await open(folder.name, '', n => dir.getDirectoryHandle(n, { create: true }));
      await writeLevel(sub, folder.id);
    }
    for (const note of notes.filter(n => folderOf(n) === parentId)) {
      const file = await open(note.title, '.md', n => dir.getFileHandle(n, { create: true }));
      const writable = await file.createWritable();
      await writable.write(note.content);
      await writable.close();
    }
  };
  await writeLevel(root, null);
  return rootName;
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

export async function storeBackupKeyProtection(protection: PassphraseWrappedKey): Promise<boolean> {
  try {
    const db = await openDB();
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(protection, BACKUP_KEY_PROTECTION_KEY);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch (error) {
    console.warn('Failed to store backup key protection in IndexedDB:', error);
    return false;
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

// Local time, sortable: 2026-11-21-1430
function fileStamp(time: number): string {
  const d = new Date(time);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

// Day of the last snapshot in this session
let snapshotDay: string | null = null;

// Before the first write of each session and each day, keep the previous
// backup as a dated copy: a bad state written at startup or a mistaken
// bulk delete can then never destroy the only backup
async function snapshotPreviousBackup(handle: FileSystemDirectoryHandle): Promise<void> {
  const today = fileStamp(Date.now()).slice(0, 10);
  if (snapshotDay === today) return;
  let existing: File;
  try {
    existing = await (await handle.getFileHandle(BACKUP_FILE)).getFile();
  } catch {
    snapshotDay = today;
    return;
  }
  const copy = await handle.getFileHandle(`${SNAPSHOT_PREFIX}${fileStamp(existing.lastModified)}.json`, { create: true });
  const writable = await copy.createWritable();
  await writable.write(existing);
  await writable.close();
  snapshotDay = today;

  const snapshots: string[] = [];
  for await (const name of handle.keys()) {
    if (name.startsWith(SNAPSHOT_PREFIX)) snapshots.push(name);
  }
  snapshots.sort();
  for (const name of snapshots.slice(0, -SNAPSHOTS_KEPT)) {
    await handle.removeEntry(name);
  }
}

export async function writeAutoBackup(
  handle: FileSystemDirectoryHandle,
  file: EncryptedBackupFile
): Promise<boolean> {
  try {
    // No verifyPermission: a background save must never prompt. A revoked
    // permission makes the write throw, and the caller checks for it
    await snapshotPreviousBackup(handle);
    const fileHandle = await handle.getFileHandle(BACKUP_FILE, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(file, null, 2));
    await writable.close();
    return true;
  } catch (error) {
    console.warn('Auto-backup write failed:', error);
    return false;
  }
}

async function parseBackup(file: File): Promise<AutoBackupReadResult | null> {
  if (file.size > MAX_IMPORT_FILE_SIZE) return null;
  const data = JSON.parse(await file.text()) as Record<string, unknown>;

  if (data.format === 'skrive-encrypted-backup') {
    const encrypted = data as unknown as EncryptedBackupFile;
    if (!encrypted.keyProtection?.wrappedKey || !encrypted.payload?.ciphertext) {
      return null;
    }
    return { kind: 'encrypted', file: encrypted };
  }

  if (typeof data.encryptionKey === 'string' && Array.isArray(data.notes)) {
    return { kind: 'legacy', data: data as unknown as LegacyAutoBackupData };
  }

  return null;
}

export async function readAutoBackup(
  handle: FileSystemDirectoryHandle
): Promise<AutoBackupReadResult | null> {
  try {
    if (!(await verifyPermission(handle))) {
      return null;
    }
    return parseBackup(await (await handle.getFileHandle(BACKUP_FILE)).getFile());
  } catch (error) {
    console.warn('Failed to read auto-backup:', error);
    return null;
  }
}

// Manual restore: the user picks the backup file or one of its dated copies
export async function pickBackupFile(): Promise<AutoBackupReadResult | null> {
  try {
    const [fileHandle] = await window.showOpenFilePicker({
      types: [{ description: 'Skrive backup', accept: { 'application/json': ['.json'] } }]
    });
    return parseBackup(await fileHandle.getFile());
  } catch (error) {
    console.warn('Failed to read backup file:', error);
    return null;
  }
}
