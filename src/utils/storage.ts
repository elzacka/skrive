import type { AppState, Note, NoteFormat, TrashedNote, Tag, Folder, ExportData } from '@/types';
import {
  encrypt,
  decrypt,
  getMasterKey,
  type EncryptedData
} from './crypto';
import { openDb } from './idb';

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
// Written on pagehide: IndexedDB cannot finish during unload, but
// localStorage.setItem is synchronous. Read first on the next start
const EMERGENCY_KEY = 'skrive-emergency';

export interface StoredState {
  lang: 'no' | 'en';
  notes: Note[];
  trash: TrashedNote[];
  tags: Tag[];
  folders: Folder[];
}

export type PersistedState = Pick<AppState, 'lang' | 'notes' | 'trash' | 'tags' | 'folders'>;

export const TRASH_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

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

const openDataDB = () => openDb(DATA_DB_NAME, DATA_STORE);

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

function normalizeState(state: StoredState): StoredState {
  return {
    lang: state.lang || 'no',
    notes: state.notes || [],
    trash: state.trash || [],
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

// The notes as loaded before they became Markdown, kept once in case a
// conversion loses something, and deleted after PRE_MARKDOWN_DAYS
const PRE_MARKDOWN_KEY = 'encrypted-state-pre-markdown';
const PRE_MARKDOWN_DAYS = 30;

export async function keepPreMarkdownCopy(state: StoredState): Promise<void> {
  try {
    const key = getMasterKey();
    if (!key || await idbGet(PRE_MARKDOWN_KEY)) return;
    const encrypted = await encrypt(JSON.stringify(state), key);
    await idbSet(PRE_MARKDOWN_KEY, { savedAt: Date.now(), state: { version: 1, encrypted } });
  } catch (error) {
    console.warn('Failed to keep pre-Markdown copy:', error);
  }
}

export async function expirePreMarkdownCopy(): Promise<void> {
  try {
    const copy = await idbGet(PRE_MARKDOWN_KEY) as { savedAt?: number } | undefined;
    if (copy && Date.now() - (copy.savedAt ?? 0) > PRE_MARKDOWN_DAYS * DAY) {
      await idbWrite(store => store.delete(PRE_MARKDOWN_KEY));
    }
  } catch (error) {
    console.warn('Failed to expire pre-Markdown copy:', error);
  }
}

export async function deleteRecoveryCopies(ids: string[]): Promise<void> {
  await idbWrite((store) => ids.forEach(id => store.delete(id)));
}

// Note history: earlier versions of each note, encrypted under its own key
// so a save of the whole state never rewrites them. A version is the text
// as it was before an edit, kept at most every HISTORY_INTERVAL
const HISTORY_PREFIX = 'note-history-';
// History written under a key that was later reset: kept aside, unread,
// for HISTORY_DAYS after it was moved
const UNREADABLE_HISTORY_PREFIX = 'unreadable-history-';
export const HISTORY_DAYS = 30;
const HISTORY_INTERVAL = 10 * 60 * 1000;
const HISTORY_MAX = 100;

export interface NoteVersion {
  // When the text was written, shown as the version's time
  savedAt: number;
  // When it became a version; expiry counts from here. Absent in older history
  keptAt?: number;
  content: string;
}

const lastVersionAt = new Map<string, number>();
// One history write at a time, so two saves never interleave on a note
let historyQueue: Promise<unknown> = Promise.resolve();
function queueHistory<T>(task: () => Promise<T>): Promise<T> {
  const run = historyQueue.then(task);
  historyQueue = run.catch(() => undefined);
  return run;
}

// null without a key. Versions another key wrote are moved aside, never
// overwritten, and the note starts a new history
async function readHistory(noteId: string): Promise<NoteVersion[] | null> {
  const blob = await idbGet(HISTORY_PREFIX + noteId) as EncryptedStoredState | undefined;
  if (!blob) return [];
  const key = getMasterKey();
  if (!key) return null;
  try {
    return JSON.parse(await decrypt(blob.encrypted, key)) as NoteVersion[];
  } catch {
    await idbWrite(store => {
      store.put({ movedAt: Date.now(), blob }, `${UNREADABLE_HISTORY_PREFIX}${noteId}-${Date.now()}`);
      store.delete(HISTORY_PREFIX + noteId);
    });
    return [];
  }
}

async function writeHistory(noteId: string, versions: NoteVersion[]): Promise<void> {
  const key = getMasterKey();
  if (!key) return;
  if (versions.length === 0) {
    await idbWrite(store => store.delete(HISTORY_PREFIX + noteId));
    return;
  }
  const encrypted = await encrypt(JSON.stringify(versions), key);
  await idbSet(HISTORY_PREFIX + noteId, { version: 1, encrypted });
}

const keptAt = (v: NoteVersion) => v.keptAt ?? v.savedAt;
const fresh = (v: NoteVersion) => Date.now() - keptAt(v) < HISTORY_DAYS * DAY;

// Keep content, written at writtenAt, as a version of the note; force skips
// the interval, for a restore that replaces text written since the last version
export function recordVersion(noteId: string, content: string, writtenAt: number, force = false): Promise<void> {
  return queueHistory(async () => {
    const since = Date.now() - (lastVersionAt.get(noteId) ?? 0);
    if (!content.trim() || (!force && since < HISTORY_INTERVAL)) return;
    const versions = await readHistory(noteId);
    if (!versions) return;
    const last = versions[versions.length - 1];
    if (last && !force && Date.now() - keptAt(last) < HISTORY_INTERVAL) {
      lastVersionAt.set(noteId, keptAt(last));
      return;
    }
    const now = Date.now();
    lastVersionAt.set(noteId, now);
    if (last?.content === content) return;
    await writeHistory(noteId, [...versions.filter(fresh), { savedAt: writtenAt, keptAt: now, content }].slice(-HISTORY_MAX));
  }).catch(error => console.warn('Failed to record note version:', error));
}

// Newest first
export async function listVersions(noteId: string): Promise<NoteVersion[]> {
  try {
    return ((await queueHistory(() => readHistory(noteId))) ?? []).filter(fresh).reverse();
  } catch {
    return [];
  }
}

export function deleteHistory(noteIds: string[]): Promise<void> {
  return queueHistory(async () => {
    const aside = (await idbKeys()).filter(k => noteIds.some(id => k.startsWith(`${UNREADABLE_HISTORY_PREFIX}${id}-`)));
    await idbWrite(store => [...noteIds.map(id => HISTORY_PREFIX + id), ...aside].forEach(k => store.delete(k)));
  }).catch(error => console.warn('Failed to delete note history:', error));
}

// Drop versions past HISTORY_DAYS and the history of notes that no longer
// exist, in the trash or out of it
export function pruneHistory(noteIds: Set<string>): Promise<void> {
  return queueHistory(async () => {
    for (const k of await idbKeys()) {
      if (k.startsWith(UNREADABLE_HISTORY_PREFIX)) {
        const aside = await idbGet(k) as { movedAt?: number } | undefined;
        if (Date.now() - (aside?.movedAt ?? 0) > HISTORY_DAYS * DAY) await idbWrite(store => store.delete(k));
        continue;
      }
      if (!k.startsWith(HISTORY_PREFIX)) continue;
      const id = k.slice(HISTORY_PREFIX.length);
      if (!noteIds.has(id)) {
        await idbWrite(store => store.delete(k));
        continue;
      }
      const versions = await readHistory(id);
      if (versions && versions.some(v => !fresh(v))) await writeHistory(id, versions.filter(fresh));
    }
  }).catch(error => console.warn('Failed to prune note history:', error));
}

export function isTrashExpired(note: TrashedNote): boolean {
  return Date.now() - note.deletedAt > TRASH_DAYS * DAY;
}

export function trashDaysLeft(note: TrashedNote): number {
  return Math.max(1, Math.ceil((TRASH_DAYS * DAY - (Date.now() - note.deletedAt)) / DAY));
}

// IndexedDB first, then legacy localStorage; unreadable data is kept
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

// Returns whether the write succeeded, for a truthful save status
export async function saveToStorageEncrypted(state: PersistedState): Promise<boolean> {
  try {
    const toSave: StoredState = {
      lang: state.lang,
      notes: state.notes,
      trash: state.trash,
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

// libsodium encrypts within a microtask, so this finishes during pagehide
export async function saveEmergencySpill(state: PersistedState): Promise<void> {
  try {
    const key = getMasterKey();
    if (!key) return;
    const encrypted = await encrypt(JSON.stringify({
      lang: state.lang,
      notes: state.notes,
      trash: state.trash,
      tags: state.tags,
      folders: state.folders
    }), key);
    const encryptedState: EncryptedStoredState = { version: 1, encrypted };
    localStorage.setItem(EMERGENCY_KEY, JSON.stringify(encryptedState));
  } catch (error) {
    console.warn('Emergency spill failed:', error);
  }
}

export function createExportData(state: Pick<ExportData, 'notes' | 'tags' | 'folders' | 'trash'>): ExportData {
  return {
    version: VERSION,
    exportedAt: Date.now(),
    notes: state.notes,
    tags: state.tags,
    folders: state.folders,
    ...(state.trash ? { trash: state.trash } : {})
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

type Fields = Record<string, unknown>;
const isObject = (v: unknown): v is Fields => !!v && typeof v === 'object' && !Array.isArray(v);
const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
// A future timestamp would win every later merge, so it is clamped to now
const time = (v: unknown, fallback: number) => isTime(v) ? Math.min(v, Date.now()) : fallback;
const parentId = (v: unknown) => typeof v === 'string' ? v : null;
const FORMATS: NoteFormat[] = ['plaintext', 'richtext', 'markdown'];

function parseNote(v: unknown): Note | null {
  if (!isObject(v) || typeof v.id !== 'string' || typeof v.title !== 'string' || typeof v.content !== 'string') return null;
  if (v.title.length > MAX_TITLE_LENGTH || v.content.length > MAX_NOTE_CONTENT_LENGTH) return null;
  const updatedAt = time(v.updatedAt, Date.now());
  return {
    id: v.id,
    title: v.title,
    content: v.content,
    format: FORMATS.includes(v.format as NoteFormat) ? v.format as NoteFormat : 'markdown',
    tags: Array.isArray(v.tags) ? v.tags.filter((t): t is string => typeof t === 'string') : [],
    parentId: parentId(v.parentId),
    createdAt: time(v.createdAt, updatedAt),
    updatedAt
  };
}

// Rebuilds the data from known fields only, so a hand-edited or foreign file
// cannot put a value of the wrong type into state. null when it is unusable
export function parseImportData(data: unknown): ExportData | null {
  if (!isObject(data)) return null;
  const { notes, tags, folders, trash } = data;
  if (typeof data.version !== 'string' || !Array.isArray(notes) || !Array.isArray(tags) || !Array.isArray(folders)) return null;
  if (trash !== undefined && !Array.isArray(trash)) return null;
  if (notes.length + (trash?.length ?? 0) > MAX_NOTES || tags.length > MAX_TAGS || folders.length > MAX_FOLDERS) return null;

  const parsedNotes = notes.map(parseNote);
  const parsedTrash = (trash ?? []).map(v => {
    const note = parseNote(v);
    return note && isObject(v) && isTime(v.deletedAt) ? { ...note, deletedAt: time(v.deletedAt, Date.now()) } : null;
  });
  const parsedTags = tags.map(v => isObject(v) && typeof v.id === 'string' && typeof v.name === 'string' && v.name.length <= MAX_TAG_NAME_LENGTH
    ? { id: v.id, name: v.name } : null);
  const parsedFolders = folders.map(v => isObject(v) && typeof v.id === 'string' && typeof v.name === 'string' && v.name.length <= MAX_FOLDER_NAME_LENGTH
    ? { id: v.id, name: v.name, parentId: parentId(v.parentId), expanded: v.expanded === true } : null);
  if ([parsedNotes, parsedTrash, parsedTags, parsedFolders].some(list => list.includes(null))) return null;

  return {
    version: data.version,
    exportedAt: time(data.exportedAt, Date.now()),
    notes: parsedNotes as Note[],
    tags: parsedTags as Tag[],
    folders: parsedFolders as Folder[],
    ...(trash ? { trash: parsedTrash as TrashedNote[] } : {})
  };
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
export const MAX_IMPORT_FILE_SIZE = 50 * 1024 * 1024;
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

// Raw JSON of a picked backup file; the caller tells encrypted from plain
export async function pickJsonFile(): Promise<unknown> {
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
        resolve(JSON.parse(await file.text()));
      } catch (error) {
        console.warn('Failed to parse import file:', error);
        resolve(null);
      }
    };

    input.click();
  });
}
