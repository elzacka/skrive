import { useEffect } from 'react';
import { useApp } from '@/contexts';
import { isMac } from '@/utils';

export function useKeyboardShortcuts() {
  const { createNote, toggleSidebar, flushSave, directoryHandle, saveCurrentNote } = useApp();
  const mac = isMac();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();

      // Ctrl+S / Cmd+S: notes auto-save, so just flush the pending write.
      // Only write a file when a folder is connected (a download dialog on
      // habitual Cmd+S is surprising)
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && key === 's') {
        e.preventDefault();
        flushSave();
        if (directoryHandle) {
          saveCurrentNote();
        }
        return;
      }

      // Ctrl+K / Cmd+K to focus search.
      // Skip when the rich text editor claims the key (there Cmd+K inserts
      // a link). Two guards because listener order is not guaranteed and
      // React flushes discrete-event state synchronously: if the editor's
      // handler ran first it has called preventDefault; if this handler
      // runs first the editor still has focus
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && key === 'k') {
        if (e.defaultPrevented || (document.activeElement as HTMLElement | null)?.isContentEditable) {
          return;
        }
        e.preventDefault();
        const searchInput = document.querySelector('.search-input') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
        return;
      }

      // Mac: Option+key, Windows: Ctrl+Shift+number
      const modifierActive = mac
        ? (e.altKey && !e.metaKey && !e.shiftKey && !e.ctrlKey)
        : (e.ctrlKey && e.shiftKey && !e.altKey);

      if (!modifierActive) return;

      // New note: Mac Opt+N, Windows Ctrl+Shift+1
      if (mac ? e.code === 'KeyN' : e.code === 'Digit1') {
        e.preventDefault();
        createNote();
        return;
      }

      // Toggle sidebar: Mac Opt+M, Windows Ctrl+Shift+3
      if (mac ? e.code === 'KeyM' : e.code === 'Digit3') {
        e.preventDefault();
        toggleSidebar();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [createNote, toggleSidebar, flushSave, directoryHandle, saveCurrentNote, mac]);
}

export function getShortcutLabels() {
  const mac = isMac();
  return {
    newNote: mac ? 'Opt+N' : 'Ctrl+Shift+1',
    tags: mac ? 'Opt+T' : 'Ctrl+Shift+2',
    toggleSidebar: mac ? 'Opt+M' : 'Ctrl+Shift+3',
    save: mac ? 'Cmd+S' : 'Ctrl+S',
    search: mac ? '⌘K' : 'Ctrl+K'
  };
}
