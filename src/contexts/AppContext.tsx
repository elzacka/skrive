import { createContext, useContext, useReducer, useEffect, useCallback, useState, useRef, type ReactNode } from 'react';
import type { AppState, Note, TrashedNote, Tag, Folder, FileSystemDirectoryHandle } from '@/types';
import {
  loadFromStorageEncrypted,
  saveToStorageEncrypted,
  saveEmergencySpill,
  createExportData,
  exportToJsonFile,
  importFromJsonFile,
  importNoteFromFile,
  validateImportData,
  listRecoveryCopies,
  readRecoveryCopies,
  deleteRecoveryCopies,
  keepPreMarkdownCopy,
  expirePreMarkdownCopy,
  recordVersion,
  deleteHistory,
  pruneHistory,
  isTrashExpired,
  type PersistedState
} from '@/utils/storage';
import {
  initializeEncryption,
  getMasterKey,
  setAsideUnreadableKey,
  protectionFitsKey,
  wrapKeyWithPassphrase,
  unwrapKeyWithPassphrase,
  encrypt,
  decrypt,
  type PassphraseWrappedKey
} from '@/utils/crypto';
import {
  verifyPermission,
  hasStoredPermission,
  getStoredBackupHandle,
  requestBackupDirectoryAccess,
  clearBackupHandle,
  writeAutoBackup,
  readAutoBackup,
  pickBackupFile,
  storeBackupKeyProtection,
  getStoredBackupKeyProtection,
  type EncryptedBackupFile,
  type LegacyAutoBackupData
} from '@/utils/fileSystem';
import { generateId, isFileSystemAccessSupported } from '@/utils/helpers';
import { htmlToMarkdown } from '@/utils/markdown';

// Notes are Markdown. HTML notes from older versions, backups and imports
// convert once (htmlToMarkdown sanitizes first); plain text already is
// Markdown text
function toMarkdownNote(note: Note): Note {
  if (note.format === 'markdown') return note;
  return { ...note, format: 'markdown', content: note.format === 'richtext' ? htmlToMarkdown(note.content) : note.content };
}

// Restore and import add to what is there and never remove a note: an
// incoming note replaces a local one only when it was edited later
function mergeById<T extends { id: string }>(current: T[], incoming: T[], isNewer?: (a: T, b: T) => boolean): T[] {
  const byId = new Map(current.map(item => [item.id, item]));
  for (const item of incoming) {
    const existing = byId.get(item.id);
    if (!existing || isNewer?.(item, existing)) byId.set(item.id, item);
  }
  return [...byId.values()];
}

type StoredData = Pick<AppState, 'notes' | 'tags' | 'folders'> & { trash?: TrashedNote[] };

// A note in use here always stays in use. An incoming note stays in the
// trash when it was deleted here after its last edit
function mergeData(current: StoredData, incoming: StoredData): Required<StoredData> {
  const trash = mergeById(current.trash ?? [], incoming.trash ?? [], (a, b) => a.deletedAt > b.deletedAt);
  const trashed = new Map(trash.map(n => [n.id, n]));
  const currentIds = new Set(current.notes.map(n => n.id));
  const notes = mergeById(current.notes, incoming.notes.map(toMarkdownNote), (a, b) => a.updatedAt > b.updatedAt)
    .filter(n => currentIds.has(n.id) || !trashed.has(n.id) || n.updatedAt > trashed.get(n.id)!.deletedAt);
  const live = new Set(notes.map(n => n.id));
  return {
    notes,
    trash: trash.filter(n => !live.has(n.id)),
    tags: mergeById(current.tags, incoming.tags),
    folders: mergeById(current.folders, incoming.folders)
  };
}

function toTrash(notes: Note[], deletedAt: number): TrashedNote[] {
  return notes.map(note => ({ ...note, deletedAt }));
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

// Helper to build a new note object
function buildNote(lang: 'no' | 'en', parentId: string | null = null): Note {
  const now = Date.now();
  return {
    id: generateId(),
    title: lang === 'no' ? 'Notat' : 'Note',
    content: '',
    format: 'markdown',
    tags: [],
    parentId,
    createdAt: now,
    updatedAt: now
  };
}

// Action types
type Action =
  | { type: 'SET_LANG'; payload: 'no' | 'en' }
  | { type: 'SET_NOTES'; payload: Note[] }
  | { type: 'ADD_NOTE'; payload: Note }
  | { type: 'UPDATE_NOTE'; payload: { id: string; updates: Partial<Note> } }
  | { type: 'DELETE_NOTES'; payload: string[] }
  | { type: 'DISCARD_NOTE'; payload: string }
  | { type: 'SET_TRASH'; payload: TrashedNote[] }
  | { type: 'RESTORE_NOTES'; payload: string[] }
  | { type: 'PURGE_NOTES'; payload: string[] }
  | { type: 'SET_TAGS'; payload: Tag[] }
  | { type: 'ADD_TAG'; payload: Tag }
  | { type: 'UPDATE_TAG'; payload: { id: string; updates: Partial<Tag> } }
  | { type: 'DELETE_TAG'; payload: string }
  | { type: 'SET_FOLDERS'; payload: Folder[] }
  | { type: 'ADD_FOLDER'; payload: Folder }
  | { type: 'UPDATE_FOLDER'; payload: { id: string; updates: Partial<Folder> } }
  | { type: 'DELETE_FOLDER'; payload: string }
  | { type: 'SELECT_NOTE'; payload: string | null }
  | { type: 'SET_TAG_FILTER'; payload: string | null }
  | { type: 'SET_SEARCH_QUERY'; payload: string }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'MERGE_DATA'; payload: StoredData };

const initialState: AppState = {
  lang: 'no',
  notes: [],
  trash: [],
  tags: [],
  folders: [],
  selectedNoteId: null,
  selectedTagFilter: null,
  searchQuery: '',
  sidebarVisible: true,
  mergeRevision: 0
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_LANG':
      return { ...state, lang: action.payload };
    
    case 'SET_NOTES':
      return { ...state, notes: action.payload };
    
    case 'ADD_NOTE':
      return { ...state, notes: [...state.notes, action.payload] };
    
    case 'UPDATE_NOTE':
      return {
        ...state,
        notes: state.notes.map(note =>
          note.id === action.payload.id
            ? { ...note, ...action.payload.updates, updatedAt: Date.now() }
            : note
        )
      };
    
    case 'DELETE_NOTES':
      return {
        ...state,
        notes: state.notes.filter(note => !action.payload.includes(note.id)),
        trash: [...state.trash, ...toTrash(state.notes.filter(note => action.payload.includes(note.id)), Date.now())],
        selectedNoteId: state.selectedNoteId && action.payload.includes(state.selectedNoteId)
          ? null
          : state.selectedNoteId
      };

    // An untouched placeholder leaves no trace in the trash
    case 'DISCARD_NOTE':
      return { ...state, notes: state.notes.filter(note => note.id !== action.payload) };

    case 'SET_TRASH':
      return { ...state, trash: action.payload };

    // A note whose folder is gone comes back at the top level
    case 'RESTORE_NOTES': {
      const restored = state.trash.filter(n => action.payload.includes(n.id)).map(({ deletedAt: _, ...note }) => ({
        ...note,
        parentId: state.folders.some(f => f.id === note.parentId) ? note.parentId : null
      }));
      return {
        ...state,
        notes: [...state.notes, ...restored],
        trash: state.trash.filter(n => !action.payload.includes(n.id))
      };
    }

    case 'PURGE_NOTES':
      return { ...state, trash: state.trash.filter(n => !action.payload.includes(n.id)) };
    
    case 'SET_TAGS':
      return { ...state, tags: action.payload };
    
    case 'ADD_TAG':
      return { ...state, tags: [...state.tags, action.payload] };

    case 'UPDATE_TAG':
      return {
        ...state,
        tags: state.tags.map(tag =>
          tag.id === action.payload.id
            ? { ...tag, ...action.payload.updates }
            : tag
        )
      };

    case 'DELETE_TAG':
      return {
        ...state,
        tags: state.tags.filter(tag => tag.id !== action.payload),
        notes: state.notes.map(note => ({
          ...note,
          tags: note.tags.filter(t => t !== action.payload)
        })),
        selectedTagFilter: state.selectedTagFilter === action.payload ? null : state.selectedTagFilter
      };
    
    case 'SET_FOLDERS':
      return { ...state, folders: action.payload };
    
    case 'ADD_FOLDER':
      return { ...state, folders: [...state.folders, action.payload] };
    
    case 'UPDATE_FOLDER':
      return {
        ...state,
        folders: state.folders.map(folder =>
          folder.id === action.payload.id
            ? { ...folder, ...action.payload.updates }
            : folder
        )
      };
    
    case 'DELETE_FOLDER': {
      const deleteRecursive = (folderId: string, folders: Folder[], notes: Note[]): { folders: Folder[]; notes: Note[] } => {
        const childFolders = folders.filter(f => f.parentId === folderId);
        let result = {
          folders: folders.filter(f => f.id !== folderId),
          notes: notes.filter(n => n.parentId !== folderId)
        };
        
        for (const child of childFolders) {
          result = deleteRecursive(child.id, result.folders, result.notes);
        }
        
        return result;
      };
      
      const result = deleteRecursive(action.payload, state.folders, state.notes);
      const removed = state.notes.filter(n => !result.notes.includes(n));
      return {
        ...state,
        ...result,
        trash: [...state.trash, ...toTrash(removed, Date.now())],
        selectedNoteId: removed.some(n => n.id === state.selectedNoteId) ? null : state.selectedNoteId
      };
    }
    
    case 'SELECT_NOTE':
      return { ...state, selectedNoteId: action.payload };
    
    case 'SET_TAG_FILTER':
      return { ...state, selectedTagFilter: action.payload };
    
    case 'SET_SEARCH_QUERY':
      return { ...state, searchQuery: action.payload };
    
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarVisible: !state.sidebarVisible };
    
    case 'MERGE_DATA':
      return { ...state, ...mergeData(state, action.payload), mergeRevision: state.mergeRevision + 1 };
    
    default:
      return state;
  }
}

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

interface AppContextValue {
  state: AppState;

  // Persistence
  saveStatus: SaveStatus;
  flushSave: () => void;
  trackLiveEdit: (content: string, noteId: string) => void;
  startupBlocked: 'key' | 'storage' | null;
  // Whether a key reset leaves the old notes reachable via the passphrase
  keyResetRecoverable: boolean;
  resetUnreadableKey: () => Promise<boolean>;
  recoveryCopies: number;
  recoverCopies: (passphrase?: string) => Promise<RecoveryResult>;
  discardRecoveryCopies: () => Promise<void>;
  storagePersisted: boolean | null;

  // Delete undo
  lastDeletedNotes: Note[] | null;
  undoDelete: () => void;
  dismissDeleted: () => void;

  // Trash
  restoreFromTrash: (ids: string[]) => void;
  purgeFromTrash: (ids: string[]) => void;

  // Language
  setLang: (lang: 'no' | 'en') => void;
  
  // Notes
  createNote: (parentId?: string | null) => void;
  duplicateNote: (id: string) => string | null;
  updateNote: (id: string, updates: Partial<Note>) => void;
  deleteNote: (id: string) => void;
  deleteNotes: (ids: string[]) => void;
  selectNote: (id: string | null) => void;
  moveNote: (noteId: string, targetFolderId: string | null) => void;

  // Tags
  addTag: (name: string) => void;
  updateTag: (id: string, updates: Partial<Tag>) => void;
  deleteTag: (id: string) => void;
  toggleNoteTag: (noteId: string, tagId: string) => void;
  setTagFilter: (tagId: string | null) => void;
  
  // Folders
  createFolder: (parentId?: string | null, name?: string) => string;
  updateFolder: (id: string, updates: Partial<Folder>) => void;
  deleteFolder: (id: string) => void;
  
  // UI
  setSearchQuery: (query: string) => void;
  toggleSidebar: () => void;
  
  // File System
  
  // Import/Export
  exportAllData: () => void;
  importData: () => Promise<boolean>;
  importNote: () => Promise<boolean>;
  
  // Auto-backup
  autoBackupEnabled: boolean;
  lastBackupTime: number | null;
  backupError: boolean;
  backupPermissionNeeded: boolean;
  reactivateBackup: () => Promise<boolean>;
  backupKeyStale: boolean;
  renewBackupProtection: (passphrase: string) => Promise<boolean>;
  enableAutoBackup: (passphrase: string) => Promise<boolean>;
  disableAutoBackup: () => Promise<void>;
  restoreFromBackup: () => Promise<boolean>;
  pendingRestore: boolean;
  confirmRestore: (passphrase: string) => Promise<boolean>;
  cancelRestore: () => void;
  fsAccessSupported: boolean;

  // Helpers
  getSelectedNote: () => Note | undefined;
  getFilteredNotes: () => Note[];
}

export type RecoveryResult = 'done' | 'needPassphrase' | 'wrongPassphrase' | 'failed' | 'saveFailed';

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [backupHandle, setBackupHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [backupKeyProtection, setBackupKeyProtection] = useState<PassphraseWrappedKey | null>(null);
  // The stored protection wraps another key than the device key; writing
  // would produce a backup no passphrase can open
  const [backupKeyStale, setBackupKeyStale] = useState(false);
  const placeholderIdRef = useRef<string | null>(null);
  // The stale marking could not be stored; hold it for this session
  const staleUnmarkedRef = useRef(false);
  const [lastBackupTime, setLastBackupTime] = useState<number | null>(null);
  const [backupError, setBackupError] = useState(false);
  const [pendingRestoreState, setPendingRestoreState] = useState<{
    file: EncryptedBackupFile;
    handle: FileSystemDirectoryHandle | null;
    source: 'init' | 'manual';
  } | null>(null);
  const [backupPermissionNeeded, setBackupPermissionNeeded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [startupBlocked, setStartupBlocked] = useState<'key' | 'storage' | null>(null);
  const [keyResetRecoverable, setKeyResetRecoverable] = useState(false);
  const [recoveryCopies, setRecoveryCopies] = useState(0);
  // Whether this session's notes came from storage or a restore. Without
  // that, arming auto-backup could overwrite a good backup with an empty state
  const hasLocalDataRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [storagePersisted, setStoragePersisted] = useState<boolean | null>(null);
  const [lastDeletedNotes, setLastDeletedNotes] = useState<Note[] | null>(null);
  const backupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initRef = useRef(false);
  // Saving is blocked until the initial load finishes so a save can never
  // overwrite stored data the app has not read yet
  const loadedRef = useRef(false);
  const pendingSaveRef = useRef<PersistedState | null>(null);
  // What the save effect last queued; state newer than this has rendered
  // but its effect has not run yet (an edit flushed during pagehide)
  const queuedRef = useRef<PersistedState | null>(null);
  // The editor's newest text, written on every keystroke without React:
  // an unload can come before the edit has rendered
  const liveEditRef = useRef<{ noteId: string; content: string } | null>(null);
  const trackLiveEdit = useCallback((content: string, noteId: string) => {
    liveEditRef.current = { noteId, content };
  }, []);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Each note's text as last written to storage; the text before an edit
  // becomes a version in the note's history
  const savedContentRef = useRef(new Map<string, string>());
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Merge restored data into state and open the most recently edited note
  const applyRestoredData = useCallback((data: StoredData) => {
    liveEditRef.current = null;
    // The empty note made at startup has no place among restored notes,
    // unless the user has written in it
    const placeholder = stateRef.current.notes.find(n => n.id === placeholderIdRef.current);
    // Every edit, rename, tag or move bumps updatedAt
    if (placeholder && placeholder.updatedAt !== placeholder.createdAt) {
      placeholderIdRef.current = null;
    } else if (placeholder) {
      dispatch({ type: 'DISCARD_NOTE', payload: placeholder.id });
    }
    const notes = data.notes.filter(n => n.id !== placeholderIdRef.current);
    dispatch({ type: 'MERGE_DATA', payload: { ...data, notes } });
    hasLocalDataRef.current = true;
    // A note deleted here after the backup stays in the trash
    const live = new Set(mergeData(stateRef.current, { ...data, notes }).notes.map(n => n.id));
    const restored = notes.filter(n => live.has(n.id));
    if (restored.length > 0) {
      const mostRecent = restored.reduce((latest, note) =>
        note.updatedAt > latest.updatedAt ? note : latest
      );
      dispatch({ type: 'SELECT_NOTE', payload: mostRecent.id });
    }
  }, []);

  // Legacy backups hold plaintext notes; their key is not needed
  const restoreLegacyBackup = useCallback((data: LegacyAutoBackupData): boolean => {
    if (!validateImportData(data)) {
      console.warn('Legacy backup failed validation');
      return false;
    }
    applyRestoredData(data);
    return true;
  }, [applyRestoredData]);

  // Load initial state with encryption
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const initApp = async () => {
      try {
        // A protection from before a new key can never fit it; mark it so
        // the next sessions know too ('stale' matches no fingerprint)
        if ((await initializeEncryption()) === 'created') {
          const protection = await getStoredBackupKeyProtection();
          if (protection && !(await storeBackupKeyProtection({ ...protection, keyCheck: 'stale' }))) {
            staleUnmarkedRef.current = true;
          }
        }
      } catch (error) {
        // Nothing is loaded and loadedRef stays false, so nothing is saved
        console.error('Encryption key could not be read:', error);
        setKeyResetRecoverable((await getStoredBackupKeyProtection()) !== null);
        setStartupBlocked('key');
        return;
      }

      // Load encrypted state
      let notes: Note[] = [];
      let lang: 'no' | 'en' = 'no';

      let hasLocalData = false;
      let trash: TrashedNote[] = [];
      let expired: TrashedNote[] = [];
      const loadResult = await loadFromStorageEncrypted();
      if (loadResult.status === 'unavailable') {
        setStartupBlocked('storage');
        return;
      }
      if (loadResult.status === 'ok') {
        hasLocalData = true;
        lang = loadResult.state.lang;
        notes = loadResult.state.notes.map(toMarkdownNote);
        if (notes.some((note, i) => note !== loadResult.state.notes[i])) {
          await keepPreMarkdownCopy(loadResult.state);
        }
        dispatch({ type: 'SET_LANG', payload: loadResult.state.lang });
        dispatch({ type: 'SET_NOTES', payload: notes });
        dispatch({ type: 'SET_TAGS', payload: loadResult.state.tags });
        dispatch({ type: 'SET_FOLDERS', payload: loadResult.state.folders });
        expired = loadResult.state.trash.filter(isTrashExpired);
        trash = loadResult.state.trash.filter(n => !isTrashExpired(n));
        dispatch({ type: 'SET_TRASH', payload: trash });
        savedContentRef.current = new Map(notes.map(n => [n.id, n.content]));
        if (expired.length > 0) deleteHistory(expired.map(n => n.id));
      }
      await expirePreMarkdownCopy();
      hasLocalDataRef.current = hasLocalData;
      const copies = (await listRecoveryCopies()).length;
      setRecoveryCopies(copies);
      // A waiting recovery copy may hold notes whose history this would delete
      if (loadResult.status === 'ok' && copies === 0) {
        pruneHistory(new Set([...notes, ...trash].map(n => n.id)));
      }
      loadedRef.current = true;
      // Saving is open now: store the trash without the expired notes
      if (expired.length > 0) dispatch({ type: 'SET_TRASH', payload: [...trash] });

      // Try to restore backup handle and stored key protection.
      // Only query permission here: requesting it without a user gesture
      // is auto-denied, so an expired permission must be surfaced instead
      const bkHandle = await getStoredBackupHandle();
      if (bkHandle) {
        if (await hasStoredPermission(bkHandle)) {
          setBackupHandle(bkHandle);
          const protection = await getStoredBackupKeyProtection();
          if (protection) {
            setBackupKeyProtection(protection);
          }

          // If no local data found, try auto-restore from backup
          if (!hasLocalData) {
            const result = await readAutoBackup(bkHandle);
            if (result?.kind === 'legacy') {
              if (restoreLegacyBackup(result.data)) {
                notes = result.data.notes;
              }
            } else if (result?.kind === 'encrypted') {
              // Encrypted backup needs the passphrase; ask via dialog
              setPendingRestoreState({ file: result.file, handle: bkHandle, source: 'init' });
            }
          }
        } else {
          // Handle exists but permission expired; keep it and let the
          // user reactivate with a click (which may prompt)
          setBackupHandle(bkHandle);
          setBackupPermissionNeeded(true);
        }
      }

      // Restore persisted last-backup timestamp
      const storedBackupTime = localStorage.getItem('skrive-last-backup');
      if (storedBackupTime) {
        const parsed = parseInt(storedBackupTime, 10);
        if (!Number.isNaN(parsed)) setLastBackupTime(parsed);
      }

      // Select most recently updated note, or create an empty richtext
      // note for first-time users (its placeholder explains the naming
      // flow; the guide popup covers the rest)
      if (notes.length > 0) {
        const mostRecent = notes.reduce((latest, note) =>
          note.updatedAt > latest.updatedAt ? note : latest
        );
        dispatch({ type: 'SELECT_NOTE', payload: mostRecent.id });
      } else {
        const note = buildNote(lang);
        placeholderIdRef.current = note.id;
        dispatch({ type: 'ADD_NOTE', payload: note });
        dispatch({ type: 'SELECT_NOTE', payload: note.id });
      }

      // Request persistent storage on all browsers so stored data is
      // protected against automatic eviction
      try {
        const persisted = await navigator.storage?.persist?.();
        setStoragePersisted(persisted ?? null);
      } catch {
        setStoragePersisted(null);
      }
    };

    initApp().catch((error) => {
      console.warn('App initialization failed:', error);
      loadedRef.current = true;
    });
  }, []);

  // Write the pending state and report the real result
  const performSave = useCallback(async () => {
    const data = pendingSaveRef.current;
    if (!data) return;
    pendingSaveRef.current = null;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setSaveStatus('saving');
    const ok = await saveToStorageEncrypted(data);
    if (ok) {
      const saved = savedContentRef.current;
      for (const note of data.notes) {
        const before = saved.get(note.id);
        if (before !== undefined && before !== note.content) recordVersion(note.id, before);
      }
      savedContentRef.current = new Map(data.notes.map(n => [n.id, n.content]));
    }
    // A newer change may have arrived while this write was in flight
    setSaveStatus(pendingSaveRef.current ? 'unsaved' : ok ? 'saved' : 'error');
  }, []);

  // Save state on changes (debounced; encrypting the full corpus on every
  // keystroke would not scale)
  useEffect(() => {
    if (!loadedRef.current) return;
    pendingSaveRef.current = {
      lang: state.lang,
      notes: state.notes,
      trash: state.trash,
      tags: state.tags,
      folders: state.folders
    };
    queuedRef.current = pendingSaveRef.current;
    // Once state holds the editor's text, the live copy has done its job; a
    // stale one would undo a later import on unload
    const live = liveEditRef.current;
    if (live && state.notes.find(n => n.id === live.noteId)?.content === live.content) {
      liveEditRef.current = null;
    }
    setSaveStatus('unsaved');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(performSave, 800);
  }, [state.lang, state.notes, state.trash, state.tags, state.folders, performSave]);

  // Flush pending saves when the tab is hidden or closing. IndexedDB may not
  // finish during pagehide, so an encrypted copy also goes to localStorage,
  // which is synchronous; the next start reads it first
  useEffect(() => {
    const queueLatest = () => {
      const latest = stateRef.current;
      const queued = queuedRef.current;
      const persisted = (): PersistedState =>
        ({ lang: latest.lang, notes: latest.notes, trash: latest.trash, tags: latest.tags, folders: latest.folders });
      if (loadedRef.current && queued && (latest.notes !== queued.notes || latest.trash !== queued.trash ||
          latest.tags !== queued.tags || latest.folders !== queued.folders || latest.lang !== queued.lang)) {
        pendingSaveRef.current = persisted();
        queuedRef.current = pendingSaveRef.current;
      }
      const live = liveEditRef.current;
      const base = pendingSaveRef.current ?? (live ? persisted() : null);
      const note = live && base?.notes.find(n => n.id === live.noteId);
      if (base && note && note.content !== live.content) {
        pendingSaveRef.current = { ...base, notes: base.notes.map(n => n.id === live.noteId ? { ...n, content: live.content, updatedAt: Date.now() } : n) };
      }
      return pendingSaveRef.current;
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        queueLatest();
        performSave();
      }
    };
    const handlePageHide = () => {
      const data = queueLatest();
      if (data) {
        saveEmergencySpill(data);
        performSave();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [performSave]);

  // Build an encrypted backup file: payload encrypted with the master key,
  // master key wrapped with the passphrase-derived key
  const buildEncryptedBackup = useCallback(async (
    protection: PassphraseWrappedKey,
    data: Required<StoredData>
  ): Promise<EncryptedBackupFile | null> => {
    const key = getMasterKey();
    if (!key) return null;
    const exportData = createExportData(data);
    const payload = await encrypt(JSON.stringify(exportData), key);
    return {
      format: 'skrive-encrypted-backup',
      version: 1,
      backupTimestamp: Date.now(),
      keyProtection: protection,
      payload
    };
  }, []);

  // Auto-backup to directory (debounced 5s).
  // Never write while a restore is pending: the state still holds a fresh
  // empty note and writing would destroy the backup being restored from
  useEffect(() => {
    if (!backupHandle || !backupKeyProtection || pendingRestoreState || backupPermissionNeeded || backupKeyStale || recoveryCopies > 0) return;

    if (backupTimerRef.current) {
      clearTimeout(backupTimerRef.current);
    }

    backupTimerRef.current = setTimeout(async () => {
      const backupFile = await buildEncryptedBackup(backupKeyProtection, {
        notes: state.notes,
        trash: state.trash,
        tags: state.tags,
        folders: state.folders
      });
      if (!backupFile) return;

      const success = await writeAutoBackup(backupHandle, backupFile);
      if (success) {
        hasLocalDataRef.current = true;
        const now = Date.now();
        setLastBackupTime(now);
        localStorage.setItem('skrive-last-backup', String(now));
        setBackupError(false);
      } else if (!(await hasStoredPermission(backupHandle))) {
        // Chrome revokes access when a tab sits in the background
        setBackupPermissionNeeded(true);
      } else {
        setBackupError(true);
      }
    }, 5000);

    return () => {
      if (backupTimerRef.current) {
        clearTimeout(backupTimerRef.current);
      }
    };
  }, [state.notes, state.trash, state.tags, state.folders, backupHandle, backupKeyProtection, pendingRestoreState, backupPermissionNeeded, backupKeyStale, recoveryCopies, buildEncryptedBackup]);

  // An older protection without a fingerprint counts as fitting: the key
  // has not changed since, or it would have been marked stale
  useEffect(() => {
    const key = getMasterKey();
    if (!backupKeyProtection || !key) return;
    protectionFitsKey(backupKeyProtection, key).then(fits => {
      setBackupKeyStale(fits === false || staleUnmarkedRef.current);
    });
  }, [backupKeyProtection]);

  // Store a protection for the device key under the given passphrase
  const protectDeviceKey = useCallback(async (passphrase: string) => {
    const key = getMasterKey();
    if (!key) return;
    const protection = await wrapKeyWithPassphrase(key, passphrase);
    await storeBackupKeyProtection(protection);
    staleUnmarkedRef.current = false;
    setBackupKeyProtection(protection);
  }, []);

  // Actions
  const setLang = useCallback((lang: 'no' | 'en') => {
    dispatch({ type: 'SET_LANG', payload: lang });
  }, []);

  const createNote = useCallback((parentId: string | null = null) => {
    const note = buildNote(state.lang, parentId);
    dispatch({ type: 'ADD_NOTE', payload: note });
    dispatch({ type: 'SELECT_NOTE', payload: note.id });
  }, [state.lang]);

  // Finder-style duplicate: same content and tags, "kopi"/"copy" suffix,
  // the copy becomes the open note
  const duplicateNote = useCallback((id: string): string | null => {
    const source = state.notes.find(n => n.id === id);
    if (!source) return null;
    const copy: Note = {
      ...source,
      id: generateId(),
      title: source.title ? `${source.title} ${state.lang === 'no' ? 'kopi' : 'copy'}` : '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    dispatch({ type: 'ADD_NOTE', payload: copy });
    dispatch({ type: 'SELECT_NOTE', payload: copy.id });
    return copy.id;
  }, [state.notes, state.lang]);

  const updateNote = useCallback((id: string, updates: Partial<Note>) => {
    dispatch({ type: 'UPDATE_NOTE', payload: { id, updates } });
  }, []);

  // Deleting keeps the notes around briefly so the user can undo
  const deleteNotes = useCallback((ids: string[]) => {
    const notes = state.notes.filter(n => ids.includes(n.id));
    if (notes.length === 0) return;
    dispatch({ type: 'DELETE_NOTES', payload: ids });
    setLastDeletedNotes(notes);
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    deleteTimerRef.current = setTimeout(() => setLastDeletedNotes(null), 6000);
  }, [state.notes]);

  const deleteNote = useCallback((id: string) => {
    deleteNotes([id]);
  }, [deleteNotes]);

  const undoDelete = useCallback(() => {
    if (!lastDeletedNotes) return;
    dispatch({ type: 'RESTORE_NOTES', payload: lastDeletedNotes.map(n => n.id) });
    dispatch({ type: 'SELECT_NOTE', payload: lastDeletedNotes[0].id });
    setLastDeletedNotes(null);
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
  }, [lastDeletedNotes]);

  const dismissDeleted = useCallback(() => {
    setLastDeletedNotes(null);
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
  }, []);

  const restoreFromTrash = useCallback((ids: string[]) => {
    dispatch({ type: 'RESTORE_NOTES', payload: ids });
    if (ids.length > 0) dispatch({ type: 'SELECT_NOTE', payload: ids[0] });
  }, []);

  // For good: the note and its history
  const purgeFromTrash = useCallback((ids: string[]) => {
    dispatch({ type: 'PURGE_NOTES', payload: ids });
    deleteHistory(ids);
  }, []);

  const selectNote = useCallback((id: string | null) => {
    dispatch({ type: 'SELECT_NOTE', payload: id });
  }, []);

  const moveNote = useCallback((noteId: string, targetFolderId: string | null) => {
    dispatch({ type: 'UPDATE_NOTE', payload: { id: noteId, updates: { parentId: targetFolderId } } });
  }, []);

  const addTag = useCallback((name: string) => {
    const tag: Tag = { id: generateId(), name };
    dispatch({ type: 'ADD_TAG', payload: tag });
  }, []);

  const updateTag = useCallback((id: string, updates: Partial<Tag>) => {
    dispatch({ type: 'UPDATE_TAG', payload: { id, updates } });
  }, []);

  const deleteTag = useCallback((id: string) => {
    dispatch({ type: 'DELETE_TAG', payload: id });
  }, []);

  const toggleNoteTag = useCallback((noteId: string, tagId: string) => {
    const note = state.notes.find(n => n.id === noteId);
    if (!note) return;
    
    const tags = note.tags.includes(tagId)
      ? note.tags.filter(t => t !== tagId)
      : [...note.tags, tagId];
    
    dispatch({ type: 'UPDATE_NOTE', payload: { id: noteId, updates: { tags } } });
  }, [state.notes]);

  const setTagFilter = useCallback((tagId: string | null) => {
    dispatch({ type: 'SET_TAG_FILTER', payload: tagId });
  }, []);

  const createFolder = useCallback((parentId: string | null = null, name?: string): string => {
    const folderName = name || (state.lang === 'no' ? 'Ny mappe' : 'New folder');
    const folder: Folder = {
      id: generateId(),
      name: folderName,
      parentId,
      expanded: false
    };
    dispatch({ type: 'ADD_FOLDER', payload: folder });
    return folder.id;
  }, [state.lang]);

  const updateFolder = useCallback((id: string, updates: Partial<Folder>) => {
    dispatch({ type: 'UPDATE_FOLDER', payload: { id, updates } });
  }, []);

  const deleteFolder = useCallback((id: string) => {
    dispatch({ type: 'DELETE_FOLDER', payload: id });
  }, []);

  const setSearchQuery = useCallback((query: string) => {
    dispatch({ type: 'SET_SEARCH_QUERY', payload: query });
  }, []);

  const toggleSidebar = useCallback(() => {
    dispatch({ type: 'TOGGLE_SIDEBAR' });
  }, []);

  const enableAutoBackup = useCallback(async (passphrase: string) => {
    if (!isFileSystemAccessSupported()) return false;
    const key = getMasterKey();
    if (!key) return false;

    const handle = await requestBackupDirectoryAccess();
    if (!handle) return false;

    const protection = await wrapKeyWithPassphrase(key, passphrase);
    await storeBackupKeyProtection(protection);
    setBackupKeyProtection(protection);
    setBackupHandle(handle);
    setBackupPermissionNeeded(false);

    // Write initial backup immediately
    const backupFile = await buildEncryptedBackup(protection, {
      notes: state.notes,
      trash: state.trash,
      tags: state.tags,
      folders: state.folders
    });
    if (backupFile) {
      const success = await writeAutoBackup(handle, backupFile);
      if (success) {
        hasLocalDataRef.current = true;
        setLastBackupTime(Date.now());
        setBackupError(false);
      }
    }
    return true;
  }, [state.notes, state.trash, state.tags, state.folders, buildEncryptedBackup]);

  const disableAutoBackup = useCallback(async () => {
    await clearBackupHandle();
    setBackupHandle(null);
    setBackupKeyProtection(null);
    setLastBackupTime(null);
    setBackupError(false);
    setBackupPermissionNeeded(false);
    localStorage.removeItem('skrive-last-backup');
  }, []);

  // Merge every recovery copy one of the keys opens; a copy is deleted
  // only after its notes are saved again
  const recoverWithKeys = useCallback(async (keys: Uint8Array[], base: StoredData = stateRef.current): Promise<'none' | 'saved' | 'saveFailed'> => {
    const { states, ids } = await readRecoveryCopies(keys);
    if (ids.length === 0) return 'none';
    let merged: Required<StoredData> = { ...base, trash: base.trash ?? [] };
    for (const recovered of states) merged = mergeData(merged, recovered);
    applyRestoredData(merged);
    const saved = await saveToStorageEncrypted({ lang: stateRef.current.lang, ...merged });
    if (saved) await deleteRecoveryCopies(ids);
    setRecoveryCopies((await listRecoveryCopies()).length);
    return saved ? 'saved' : 'saveFailed';
  }, [applyRestoredData]);

  const restoreFromBackup = useCallback(async () => {
    if (!isFileSystemAccessSupported()) return false;

    const result = await pickBackupFile();
    if (!result) return false;

    if (result.kind === 'legacy') {
      return restoreLegacyBackup(result.data);
    }

    setPendingRestoreState({ file: result.file, handle: null, source: 'manual' });
    return true;
  }, [restoreLegacyBackup]);

  // The backup is opened with its own key, and its notes are saved with this
  // device's key: the master key never changes, so no stored copy goes stale
  const confirmRestore = useCallback(async (passphrase: string) => {
    if (!pendingRestoreState) return false;
    const { file, handle } = pendingRestoreState;
    const currentKey = getMasterKey();
    if (!currentKey) return false;

    try {
      const backupKey = await unwrapKeyWithPassphrase(file.keyProtection, passphrase);
      const data: unknown = JSON.parse(await decrypt(file.payload, backupKey));
      if (!validateImportData(data)) {
        console.warn('Encrypted backup failed validation');
        return false;
      }
      applyRestoredData(data);
      // The backup key may be the key a lost one replaced: open waiting
      // recovery copies with it, and rewrap only once they are saved
      const recovered = await recoverWithKeys([currentKey, backupKey], mergeData(stateRef.current, data));

      // At startup the restore re-arms auto-backup with the same
      // passphrase; a manual restore keeps the current backup setup
      if (handle && recovered !== 'saveFailed') {
        await protectDeviceKey(passphrase);
        setBackupHandle(handle);
      }
      setPendingRestoreState(null);
      return true;
    } catch {
      // Wrong passphrase or corrupted backup; keep the dialog open
      return false;
    }
  }, [pendingRestoreState, applyRestoredData, recoverWithKeys, protectDeviceKey]);

  const cancelRestore = useCallback(() => {
    // If the restore was triggered at startup (no local data), cancelling
    // must also disarm auto-backup: the state holds a fresh empty note and
    // an armed backup would overwrite the backup file with it
    if (pendingRestoreState?.source === 'init') {
      setBackupHandle(null);
      setBackupKeyProtection(null);
    }
    setPendingRestoreState(null);
  }, [pendingRestoreState]);

  // Re-request backup folder permission after it expired (needs a user
  // gesture, so this is called from a click)
  const reactivateBackup = useCallback(async () => {
    if (!backupHandle) return false;
    if (!(await verifyPermission(backupHandle))) return false;
    const protection = await getStoredBackupKeyProtection();
    if (protection) {
      setBackupKeyProtection(protection);
    }
    setBackupPermissionNeeded(false);
    setBackupError(false);

    // Same rule as at startup: with nothing loaded locally, offer the
    // backup instead of overwriting it
    if (!hasLocalDataRef.current) {
      const result = await readAutoBackup(backupHandle);
      if (result?.kind === 'legacy') {
        restoreLegacyBackup(result.data);
      } else if (result?.kind === 'encrypted') {
        setPendingRestoreState({ file: result.file, handle: backupHandle, source: 'init' });
      }
    }
    return true;
  }, [backupHandle, restoreLegacyBackup]);

  // First the device key; then, given the passphrase, the key stored for
  // auto-backup, which is the old key if a lost one was replaced
  const recoverCopies = useCallback(async (passphrase?: string): Promise<RecoveryResult> => {
    const currentKey = getMasterKey();
    const protection = await getStoredBackupKeyProtection();
    const keys = currentKey ? [currentKey] : [];
    if (passphrase && protection) {
      let backupKey: Uint8Array;
      try {
        backupKey = await unwrapKeyWithPassphrase(protection, passphrase);
      } catch {
        return 'wrongPassphrase';
      }
      // A protection that wraps the device key cannot open anything more
      if (currentKey && bytesEqual(backupKey, currentKey)) return 'failed';
      keys.push(backupKey);
    }

    if (await recoverWithKeys(keys) === 'saveFailed') return 'saveFailed';
    // The protection wrapped an older key: wrap the device key instead,
    // or every later backup would be unreadable
    if (passphrase && protection) await protectDeviceKey(passphrase);
    if ((await listRecoveryCopies()).length === 0) return 'done';
    return !passphrase && protection ? 'needPassphrase' : 'failed';
  }, [recoverWithKeys, protectDeviceKey]);

  // The passphrase must open the old protection: that proves it is the
  // user's and lets waiting copies open before the old key is let go
  const renewBackupProtection = useCallback(async (passphrase: string) => {
    const protection = backupKeyProtection ?? await getStoredBackupKeyProtection();
    const currentKey = getMasterKey();
    if (!protection || !currentKey) return false;
    let oldKey: Uint8Array;
    try {
      oldKey = await unwrapKeyWithPassphrase(protection, passphrase);
    } catch {
      return false;
    }
    if (await recoverWithKeys([currentKey, oldKey]) === 'saveFailed') return false;
    await protectDeviceKey(passphrase);
    return true;
  }, [backupKeyProtection, recoverWithKeys, protectDeviceKey]);

  const discardRecoveryCopies = useCallback(async () => {
    await deleteRecoveryCopies(await listRecoveryCopies());
    setRecoveryCopies(0);
  }, []);

  const exportAllData = useCallback(() => {
    // Deleted notes stay out of an unencrypted file
    exportToJsonFile(createExportData({ notes: state.notes, tags: state.tags, folders: state.folders }));
  }, [state]);

  const importData = useCallback(async () => {
    const data = await importFromJsonFile();
    if (data) {
      dispatch({ type: 'MERGE_DATA', payload: data });
      return true;
    }
    return false;
  }, []);

  const importNote = useCallback(async () => {
    const imported = await importNoteFromFile();
    if (imported) {
      const note: Note = {
        id: generateId(),
        title: imported.title,
        content: imported.content,
        format: 'markdown',
        tags: [],
        parentId: null,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      dispatch({ type: 'ADD_NOTE', payload: note });
      dispatch({ type: 'SELECT_NOTE', payload: note.id });
      return true;
    }
    return false;
  }, []);

  const getSelectedNote = useCallback(() => {
    return state.notes.find(n => n.id === state.selectedNoteId);
  }, [state.notes, state.selectedNoteId]);

  const getFilteredNotes = useCallback(() => {
    return state.notes.filter(note => {
      if (state.selectedTagFilter && !note.tags.includes(state.selectedTagFilter)) {
        return false;
      }
      if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase();
        return note.title.toLowerCase().includes(q) ||
               note.content.toLowerCase().includes(q);
      }
      return true;
    });
  }, [state.notes, state.selectedTagFilter, state.searchQuery]);

  const value: AppContextValue = {
    state,
    saveStatus,
    flushSave: performSave,
    trackLiveEdit,
    startupBlocked,
    keyResetRecoverable,
    resetUnreadableKey: async () => {
      try {
        await setAsideUnreadableKey();
      } catch (error) {
        console.error('Key reset failed:', error);
        return false;
      }
      location.reload();
      return true;
    },
    recoveryCopies,
    recoverCopies,
    discardRecoveryCopies,
    storagePersisted,
    lastDeletedNotes,
    undoDelete,
    dismissDeleted,
    restoreFromTrash,
    purgeFromTrash,
    setLang,
    createNote,
    duplicateNote,
    updateNote,
    deleteNote,
    deleteNotes,
    selectNote,
    moveNote,
    addTag,
    updateTag,
    deleteTag,
    toggleNoteTag,
    setTagFilter,
    createFolder,
    updateFolder,
    deleteFolder,
    setSearchQuery,
    toggleSidebar,
    autoBackupEnabled: backupHandle !== null,
    lastBackupTime,
    backupError,
    backupPermissionNeeded,
    reactivateBackup,
    backupKeyStale,
    renewBackupProtection,
    enableAutoBackup,
    disableAutoBackup,
    restoreFromBackup,
    pendingRestore: pendingRestoreState !== null,
    confirmRestore,
    cancelRestore,
    fsAccessSupported: isFileSystemAccessSupported(),
    exportAllData,
    importData,
    importNote,
    getSelectedNote,
    getFilteredNotes
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
