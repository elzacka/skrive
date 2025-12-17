import { useEffect } from 'react';
import { useApp } from '@/contexts';
import { isMac } from '@/utils';

export function useKeyboardShortcuts() {
  const { createNote, toggleSidebar, saveCurrentNote } = useApp();
  const mac = isMac();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();

      // Ctrl+S / Cmd+S to export
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && key === 's') {
        e.preventDefault();
        saveCurrentNote();
        return;
      }

      // Ctrl+K / Cmd+K to focus search
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && key === 'k') {
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
  }, [createNote, toggleSidebar, saveCurrentNote, mac]);
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
