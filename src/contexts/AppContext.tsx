import { createContext, useContext, useReducer, useEffect, useCallback, useState, type ReactNode } from 'react';
import type { AppState, Note, Tag, Folder, ExportData, FileSystemDirectoryHandle } from '@/types';
import {
  loadFromStorage,
  saveToStorage,
  initializeEncryption,
  loadFromStorageEncrypted,
  createExportData,
  exportToJsonFile,
  importFromJsonFile
} from '@/utils/storage';
import { 
  getStoredDirectoryHandle, 
  requestDirectoryAccess, 
  clearStoredDirectoryHandle,
  saveNote,
  verifyPermission
} from '@/utils/fileSystem';
import { generateId } from '@/utils/helpers';

// Action types
type Action =
  | { type: 'SET_LANG'; payload: 'no' | 'en' }
  | { type: 'SET_NOTES'; payload: Note[] }
  | { type: 'ADD_NOTE'; payload: Note }
  | { type: 'UPDATE_NOTE'; payload: { id: string; updates: Partial<Note> } }
  | { type: 'DELETE_NOTE'; payload: string }
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
    
    case 'DELETE_NOTE':
      return {
        ...state,
        notes: state.notes.filter(note => note.id !== action.payload),
        selectedNoteId: state.selectedNoteId === action.payload ? null : state.selectedNoteId
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

interface AppContextValue {
  state: AppState;
  directoryHandle: FileSystemDirectoryHandle | null;
  isOnline: boolean;
  
  // Language
  setLang: (lang: 'no' | 'en') => void;
  
  // Notes
  createNote: (parentId?: string | null) => void;
  updateNote: (id: string, updates: Partial<Note>) => void;
  deleteNote: (id: string) => void;
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
  createFolder: (parentId?: string | null, name?: string) => void;
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
  
  // Helpers
  getSelectedNote: () => Note | undefined;
  getFilteredNotes: () => Note[];
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Load initial state with encryption
  useEffect(() => {
    const initApp = async () => {
      // Initialize encryption first
      await initializeEncryption();

      // Load encrypted state
      const stored = await loadFromStorageEncrypted();
      if (stored) {
        dispatch({ type: 'SET_LANG', payload: stored.lang });
        dispatch({ type: 'SET_NOTES', payload: stored.notes });
        dispatch({ type: 'SET_TAGS', payload: stored.tags });
        dispatch({ type: 'SET_FOLDERS', payload: stored.folders });
      } else {
        // Fall back to legacy unencrypted storage
        const legacy = loadFromStorage();
        if (legacy) {
          dispatch({ type: 'SET_LANG', payload: legacy.lang });
          dispatch({ type: 'SET_NOTES', payload: legacy.notes });
          dispatch({ type: 'SET_TAGS', payload: legacy.tags });
          dispatch({ type: 'SET_FOLDERS', payload: legacy.folders });
        }
      }

      // Try to restore directory handle
      const handle = await getStoredDirectoryHandle();
      if (handle && await verifyPermission(handle)) {
        setDirectoryHandle(handle);
      }
    };

    initApp();
  }, []);

  // Save state on changes
  useEffect(() => {
    saveToStorage({
      lang: state.lang,
      notes: state.notes,
      tags: state.tags,
      folders: state.folders
    });
  }, [state.lang, state.notes, state.tags, state.folders]);

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

  const createNote = useCallback((parentId: string | null = null) => {
    const note: Note = {
      id: generateId(),
      title: state.lang === 'no' ? 'Notat' : 'Note',
      content: '',
      format: 'plaintext',
      tags: [],
      parentId,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    dispatch({ type: 'ADD_NOTE', payload: note });
    dispatch({ type: 'SELECT_NOTE', payload: note.id });
  }, [state.lang]);

  const updateNote = useCallback((id: string, updates: Partial<Note>) => {
    dispatch({ type: 'UPDATE_NOTE', payload: { id, updates } });
  }, []);

  const deleteNote = useCallback((id: string) => {
    dispatch({ type: 'DELETE_NOTE', payload: id });
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

  const createFolder = useCallback((parentId: string | null = null, name?: string) => {
    const folderName = name || (state.lang === 'no' ? 'Ny mappe' : 'New folder');
    const folder: Folder = {
      id: generateId(),
      name: folderName,
      parentId,
      expanded: true
    };
    dispatch({ type: 'ADD_FOLDER', payload: folder });
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

  const exportAllData = useCallback(() => {
    const data = createExportData(state);
    exportToJsonFile(data);
  }, [state]);

  const importData = useCallback(async () => {
    const data = await importFromJsonFile();
    if (data) {
      dispatch({ type: 'IMPORT_DATA', payload: data });
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
    directoryHandle,
    isOnline,
    setLang,
    createNote,
    updateNote,
    deleteNote,
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
    exportAllData,
    importData,
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
