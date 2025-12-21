import type { Note, ExportData, FileSystemDirectoryHandle } from '@/types';
import { getExtensionFromFormat, getMimeTypeFromFormat, htmlToMarkdown, htmlToRtf } from './helpers';

const DIRECTORY_HANDLE_KEY = 'skrive-directory-handle';

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
      mode: 'readwrite',
      startIn: 'documents'
    });
    await storeDirectoryHandle(handle);
    return handle;
  } catch (error) {
    // User cancelled or permission denied - this is expected behavior
    return null;
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
    const filename = `${note.title.replace(/[<>:"/\\|?*]/g, '_')}${extension}`;
    
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

export type ExportFormat = 'native' | 'markdown' | 'rtf';

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
