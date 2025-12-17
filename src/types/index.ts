// Note types
export interface Note {
  id: string;
  title: string;
  content: string;
  format: NoteFormat;
  tags: string[];
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
}

export type NoteFormat = 'plaintext' | 'richtext' | 'markdown';

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  expanded: boolean;
}

export interface Tag {
  id: string;
  name: string;
}

// App state
export interface AppState {
  lang: 'no' | 'en';
  notes: Note[];
  tags: Tag[];
  folders: Folder[];
  selectedNoteId: string | null;
  selectedTagFilter: string | null;
  searchQuery: string;
  sidebarVisible: boolean;
}

// File System Access API types
export interface FileSystemDirectoryHandle {
  kind: 'directory';
  name: string;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  resolve(possibleDescendant: FileSystemHandle): Promise<string[] | null>;
  values(): AsyncIterableIterator<FileSystemHandle>;
  keys(): AsyncIterableIterator<string>;
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
}

export interface FileSystemFileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
  createWritable(options?: { keepExistingData?: boolean }): Promise<FileSystemWritableFileStream>;
}

export interface FileSystemWritableFileStream extends WritableStream {
  write(data: string | BufferSource | Blob): Promise<void>;
  seek(position: number): Promise<void>;
  truncate(size: number): Promise<void>;
}

export type FileSystemHandle = FileSystemDirectoryHandle | FileSystemFileHandle;

// Extend Window for File System Access API
declare global {
  interface Window {
    showDirectoryPicker(options?: {
      id?: string;
      mode?: 'read' | 'readwrite';
      startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
    }): Promise<FileSystemDirectoryHandle>;
    showSaveFilePicker(options?: {
      excludeAcceptAllOption?: boolean;
      suggestedName?: string;
      types?: Array<{
        description?: string;
        accept: Record<string, string[]>;
      }>;
    }): Promise<FileSystemFileHandle>;
    showOpenFilePicker(options?: {
      multiple?: boolean;
      excludeAcceptAllOption?: boolean;
      types?: Array<{
        description?: string;
        accept: Record<string, string[]>;
      }>;
    }): Promise<FileSystemFileHandle[]>;
  }
}

// Export data structure for JSON sync
export interface ExportData {
  version: string;
  exportedAt: number;
  notes: Note[];
  tags: Tag[];
  folders: Folder[];
}

// i18n types
export interface I18nStrings {
  save: string;
  tags: string;
  all: string;
  notes: string;
  note: string;
  folder: string;
  newNote: string;
  newFolder: string;
  assignTags: string;
  newTagPlaceholder: string;
  addTag: string;
  manageTags: string;
  titlePlaceholder: string;
  editorPlaceholder: string;
  created: string;
  modified: string;
  export: string;
  delete: string;
  rename: string;
  shortcuts: string;
  newNoteShortcut: string;
  searchShortcut: string;
  saveShortcut: string;
  toggleSidebar: string;
  undoShortcut: string;
  redoShortcut: string;
  exportShortcut: string;
  formatShortcut: string;
  formatting: string;
  format: string;
  plaintext: string;
  richtext: string;
  markdown: string;
  bodyText: string;
  heading1: string;
  heading2: string;
  heading3: string;
  search: string;
  importExport: string;
  importData: string;
  exportData: string;
  connectFolder: string;
  disconnectFolder: string;
  folderConnected: string;
  noFolderConnected: string;
  offline: string;
  online: string;
  syncStatus: string;
  lastSynced: string;
  install: string;
}

export type I18n = {
  no: I18nStrings;
  en: I18nStrings;
};
