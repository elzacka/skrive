import { createContext, useContext, useReducer, useEffect, useCallback, useState, useRef, type ReactNode } from 'react';
import type { AppState, Note, Tag, Folder, ExportData, FileSystemDirectoryHandle } from '@/types';
import {
  loadFromStorageEncrypted,
  saveToStorageEncrypted,
  saveEmergencySpill,
  createExportData,
  exportToJsonFile,
  importFromJsonFile,
  importNoteFromFile,
  validateImportData
} from '@/utils/storage';
import {
  initializeEncryption,
  getMasterKey,
  persistMasterKey,
  importKeyFromBase64,
  wrapKeyWithPassphrase,
  unwrapKeyWithPassphrase,
  encrypt,
  decrypt,
  type PassphraseWrappedKey
} from '@/utils/crypto';
import {
  getStoredDirectoryHandle,
  requestDirectoryAccess,
  clearStoredDirectoryHandle,
  saveNote,
  verifyPermission,
  hasStoredPermission,
  getStoredBackupHandle,
  requestBackupDirectoryAccess,
  clearBackupHandle,
  writeAutoBackup,
  readAutoBackup,
  storeBackupKeyProtection,
  getStoredBackupKeyProtection,
  type EncryptedBackupFile,
  type LegacyAutoBackupData
} from '@/utils/fileSystem';
import { generateId, isFileSystemAccessSupported } from '@/utils/helpers';
import { sanitizeHtml } from '@/utils/sanitize';

// Sanitize richtext content on any path where notes enter from outside
// (import, backup restore) so stored content is always clean
function sanitizeNotes(notes: Note[]): Note[] {
  return notes.map(note =>
    note.format === 'richtext' ? { ...note, content: sanitizeHtml(note.content) } : note
  );
}

// Helper to build a new note object
function buildNote(
  lang: 'no' | 'en',
  format: Note['format'],
  parentId: string | null = null
): Note {
  return {
    id: generateId(),
    title: lang === 'no' ? 'Notat' : 'Note',
    content: '',
    format,
    tags: [],
    parentId,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

// Action types
type Action =
  | { type: 'SET_LANG'; payload: 'no' | 'en' }
  | { type: 'SET_NOTES'; payload: Note[] }
  | { type: 'ADD_NOTE'; payload: Note }
  | { type: 'UPDATE_NOTE'; payload: { id: string; updates: Partial<Note> } }
  | { type: 'DELETE_NOTES'; payload: string[] }
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
  | { type: 'IMPORT_DATA'; payload: ExportData };

const initialState: AppState = {
  lang: 'no',
  notes: [],
  tags: [],
  folders: [],
  selectedNoteId: null,
  selectedTagFilter: null,
  searchQuery: '',
  sidebarVisible: true
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
        selectedNoteId: state.selectedNoteId && action.payload.includes(state.selectedNoteId)
          ? null
          : state.selectedNoteId
      };
    
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
      return { ...state, ...result };
    }
    
    case 'SELECT_NOTE':
      return { ...state, selectedNoteId: action.payload };
    
    case 'SET_TAG_FILTER':
      return { ...state, selectedTagFilter: action.payload };
    
    case 'SET_SEARCH_QUERY':
      return { ...state, searchQuery: action.payload };
    
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarVisible: !state.sidebarVisible };
    
    case 'IMPORT_DATA':
      return {
        ...state,
        notes: action.payload.notes,
        tags: action.payload.tags,
        folders: action.payload.folders
      };
    
    default:
      return state;
  }
}

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

interface AppContextValue {
  state: AppState;
  directoryHandle: FileSystemDirectoryHandle | null;
  isOnline: boolean;

  // Persistence
  saveStatus: SaveStatus;
  flushSave: () => void;
  storageLoadError: boolean;
  dismissStorageError: () => void;
  storagePersisted: boolean | null;

  // Delete undo
  lastDeletedNotes: Note[] | null;
  undoDelete: () => void;
  dismissDeleted: () => void;

  // Language
  setLang: (lang: 'no' | 'en') => void;
  
  // Notes
  createNote: (parentId?: string | null, format?: Note['format']) => void;
  duplicateNote: (id: string) => string | null;
  updateNote: (id: string, updates: Partial<Note>) => void;
  deleteNote: (id: string) => void;
  deleteNotes: (ids: string[]) => void;
  selectNote: (id: string | null) => void;
  saveCurrentNote: () => Promise<void>;
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
  connectDirectory: () => Promise<boolean>;
  disconnectDirectory: () => Promise<void>;
  
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

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [backupHandle, setBackupHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [backupKeyProtection, setBackupKeyProtection] = useState<PassphraseWrappedKey | null>(null);
  const [lastBackupTime, setLastBackupTime] = useState<number | null>(null);
  const [backupError, setBackupError] = useState(false);
  const [pendingRestoreState, setPendingRestoreState] = useState<{
    file: EncryptedBackupFile;
    handle: FileSystemDirectoryHandle;
    source: 'init' | 'manual';
  } | null>(null);
  const [backupPermissionNeeded, setBackupPermissionNeeded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [storageLoadError, setStorageLoadError] = useState(false);
  const [storagePersisted, setStoragePersisted] = useState<boolean | null>(null);
  const [lastDeletedNotes, setLastDeletedNotes] = useState<Note[] | null>(null);
  const backupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initRef = useRef(false);
  // Saving is blocked until the initial load finishes so a save can never
  // overwrite stored data the app has not read yet
  const loadedRef = useRef(false);
  const pendingSaveRef = useRef<Pick<AppState, 'lang' | 'notes' | 'tags' | 'folders'> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Apply restored/imported data to state and select the most recent note
  const applyRestoredData = useCallback((data: { notes: Note[]; tags: Tag[]; folders: Folder[] }) => {
    const notes = sanitizeNotes(data.notes);
    dispatch({ type: 'SET_NOTES', payload: notes });
    dispatch({ type: 'SET_TAGS', payload: data.tags });
    dispatch({ type: 'SET_FOLDERS', payload: data.folders });
    if (notes.length > 0) {
      const mostRecent = notes.reduce((latest, note) =>
        note.updatedAt > latest.updatedAt ? note : latest
      );
      dispatch({ type: 'SELECT_NOTE', payload: mostRecent.id });
    }
  }, []);

  // Restore from a legacy plaintext backup file (validated); the key is
  // migrated into wrapped IndexedDB storage
  const restoreLegacyBackup = useCallback(async (data: LegacyAutoBackupData): Promise<boolean> => {
    try {
      if (!validateImportData(data)) {
        console.warn('Legacy backup failed validation');
        return false;
      }
      const restoredKey = importKeyFromBase64(data.encryptionKey);
      await persistMasterKey(restoredKey);
      applyRestoredData(data);
      return true;
    } catch (error) {
      console.warn('Legacy backup restore failed:', error);
      return false;
    }
  }, [applyRestoredData]);

  // Load initial state with encryption
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const initApp = async () => {
      // Initialize encryption first
      await initializeEncryption();

      // Load encrypted state
      let notes: Note[] = [];
      let lang: 'no' | 'en' = 'no';

      let hasLocalData = false;
      const loadResult = await loadFromStorageEncrypted();
      if (loadResult.status === 'ok') {
        hasLocalData = true;
        lang = loadResult.state.lang;
        notes = loadResult.state.notes;
        dispatch({ type: 'SET_LANG', payload: loadResult.state.lang });
        dispatch({ type: 'SET_NOTES', payload: loadResult.state.notes });
        dispatch({ type: 'SET_TAGS', payload: loadResult.state.tags });
        dispatch({ type: 'SET_FOLDERS', payload: loadResult.state.folders });
      } else if (loadResult.status === 'error') {
        // Stored data exists but could not be read; a recovery copy has
        // been preserved so continuing with a fresh state is safe
        setStorageLoadError(true);
      }
      loadedRef.current = true;

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
              if (await restoreLegacyBackup(result.data)) {
                notes = sanitizeNotes(result.data.notes);
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
        const note = buildNote(lang, 'richtext');
        dispatch({ type: 'ADD_NOTE', payload: note });
        dispatch({ type: 'SELECT_NOTE', payload: note.id });
      }

      // Try to restore directory handle (query-only, no prompt)
      const handle = await getStoredDirectoryHandle();
      if (handle && await hasStoredPermission(handle)) {
        setDirectoryHandle(handle);
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
      tags: state.tags,
      folders: state.folders
    };
    setSaveStatus('unsaved');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(performSave, 800);
  }, [state.lang, state.notes, state.tags, state.folders, performSave]);

  // Flush pending saves when the tab is hidden or about to close.
  // On pagehide the async IndexedDB write may not complete, so spill an
  // encrypted copy synchronously to localStorage as well; it is read and
  // migrated back on next startup
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') performSave();
    };
    const handlePageHide = () => {
      const data = pendingSaveRef.current;
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
    data: Pick<AppState, 'notes' | 'tags' | 'folders'>
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
    if (!backupHandle || !backupKeyProtection || pendingRestoreState || backupPermissionNeeded) return;

    if (backupTimerRef.current) {
      clearTimeout(backupTimerRef.current);
    }

    backupTimerRef.current = setTimeout(async () => {
      const backupFile = await buildEncryptedBackup(backupKeyProtection, {
        notes: state.notes,
        tags: state.tags,
        folders: state.folders
      });
      if (!backupFile) return;

      const success = await writeAutoBackup(backupHandle, backupFile);
      if (success) {
        const now = Date.now();
        setLastBackupTime(now);
        localStorage.setItem('skrive-last-backup', String(now));
        setBackupError(false);
      } else {
        setBackupError(true);
      }
    }, 5000);

    return () => {
      if (backupTimerRef.current) {
        clearTimeout(backupTimerRef.current);
      }
    };
  }, [state.notes, state.tags, state.folders, backupHandle, backupKeyProtection, pendingRestoreState, backupPermissionNeeded, buildEncryptedBackup]);

  // Online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Actions
  const setLang = useCallback((lang: 'no' | 'en') => {
    dispatch({ type: 'SET_LANG', payload: lang });
  }, []);

  const createNote = useCallback((parentId: string | null = null, format: Note['format'] = 'richtext') => {
    const note = buildNote(state.lang, format, parentId);
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
    for (const note of lastDeletedNotes) {
      dispatch({ type: 'ADD_NOTE', payload: note });
    }
    dispatch({ type: 'SELECT_NOTE', payload: lastDeletedNotes[0].id });
    setLastDeletedNotes(null);
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
  }, [lastDeletedNotes]);

  const dismissDeleted = useCallback(() => {
    setLastDeletedNotes(null);
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
  }, []);

  const selectNote = useCallback((id: string | null) => {
    dispatch({ type: 'SELECT_NOTE', payload: id });
  }, []);

  const saveCurrentNote = useCallback(async () => {
    const note = state.notes.find(n => n.id === state.selectedNoteId);
    if (note) {
      await saveNote(note, directoryHandle);
    }
  }, [state.notes, state.selectedNoteId, directoryHandle]);

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

  const connectDirectory = useCallback(async () => {
    const handle = await requestDirectoryAccess();
    if (handle) {
      setDirectoryHandle(handle);
      return true;
    }
    return false;
  }, []);

  const disconnectDirectory = useCallback(async () => {
    await clearStoredDirectoryHandle();
    setDirectoryHandle(null);
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
      tags: state.tags,
      folders: state.folders
    });
    if (backupFile) {
      const success = await writeAutoBackup(handle, backupFile);
      if (success) {
        setLastBackupTime(Date.now());
        setBackupError(false);
      }
    }
    return true;
  }, [state.notes, state.tags, state.folders, buildEncryptedBackup]);

  const disableAutoBackup = useCallback(async () => {
    await clearBackupHandle();
    setBackupHandle(null);
    setBackupKeyProtection(null);
    setLastBackupTime(null);
    setBackupError(false);
    setBackupPermissionNeeded(false);
    localStorage.removeItem('skrive-last-backup');
  }, []);

  const restoreFromBackup = useCallback(async () => {
    if (!isFileSystemAccessSupported()) return false;

    const handle = await requestBackupDirectoryAccess();
    if (!handle) return false;

    const result = await readAutoBackup(handle);
    if (!result) return false;

    if (result.kind === 'legacy') {
      // Legacy plaintext backup: restore directly, but do not enable
      // auto-backup until the user re-enables it with a passphrase
      return restoreLegacyBackup(result.data);
    }

    // Encrypted backup: ask for the passphrase via dialog
    setPendingRestoreState({ file: result.file, handle, source: 'manual' });
    return true;
  }, [restoreLegacyBackup]);

  const confirmRestore = useCallback(async (passphrase: string) => {
    if (!pendingRestoreState) return false;
    const { file, handle } = pendingRestoreState;

    try {
      const restoredKey = await unwrapKeyWithPassphrase(file.keyProtection, passphrase);
      const json = await decrypt(file.payload, restoredKey);
      const data: unknown = JSON.parse(json);
      if (!validateImportData(data)) {
        console.warn('Encrypted backup failed validation');
        return false;
      }

      await persistMasterKey(restoredKey);
      applyRestoredData(data);

      // Keep auto-backup running with the same passphrase protection
      await storeBackupKeyProtection(file.keyProtection);
      setBackupKeyProtection(file.keyProtection);
      setBackupHandle(handle);
      setPendingRestoreState(null);
      return true;
    } catch {
      // Wrong passphrase or corrupted backup; keep the dialog open
      return false;
    }
  }, [pendingRestoreState, applyRestoredData]);

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
    return true;
  }, [backupHandle]);

  const exportAllData = useCallback(() => {
    const data = createExportData(state);
    exportToJsonFile(data);
  }, [state]);

  const importData = useCallback(async () => {
    const data = await importFromJsonFile();
    if (data) {
      dispatch({ type: 'IMPORT_DATA', payload: { ...data, notes: sanitizeNotes(data.notes) } });
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
        format: imported.format,
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
        // Match against visible text, not markup: richtext content is HTML
        const text = note.format === 'richtext'
          ? note.content.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
          : note.content;
        return note.title.toLowerCase().includes(q) ||
               text.toLowerCase().includes(q);
      }
      return true;
    });
  }, [state.notes, state.selectedTagFilter, state.searchQuery]);

  const value: AppContextValue = {
    state,
    directoryHandle,
    isOnline,
    saveStatus,
    flushSave: performSave,
    storageLoadError,
    dismissStorageError: () => setStorageLoadError(false),
    storagePersisted,
    lastDeletedNotes,
    undoDelete,
    dismissDeleted,
    setLang,
    createNote,
    duplicateNote,
    updateNote,
    deleteNote,
    deleteNotes,
    selectNote,
    saveCurrentNote,
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
    connectDirectory,
    disconnectDirectory,
    autoBackupEnabled: backupHandle !== null,
    lastBackupTime,
    backupError,
    backupPermissionNeeded,
    reactivateBackup,
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
