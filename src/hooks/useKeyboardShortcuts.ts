import { useEffect } from 'react';
import { useApp } from '@/contexts';
import { isMac } from '@/utils';

export function useKeyboardShortcuts() {
  const { createNote, toggleSidebar, flushSave } = useApp();
  const mac = isMac();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S / Cmd+S: notes auto-save, so just flush the pending write
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.code === 'KeyS') {
        e.preventDefault();
        flushSave();
        return;
      }
      // A modal dialog owns the rest of the keyboard
      if (document.querySelector('[aria-modal="true"]')) return;

      // Ctrl+K / Cmd+K focuses search, except in the editor, where it
      // inserts a link. The editor sits in a shadow root, so its content is
      // found through the event's composed path, not document.activeElement
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.code === 'KeyK') {
        if (e.defaultPrevented || (e.composedPath()[0] as HTMLElement | undefined)?.isContentEditable) {
          return;
        }
        e.preventDefault();
        const focusSearch = () => {
          const searchInput = document.querySelector<HTMLInputElement>('.search-input');
          searchInput?.focus();
          searchInput?.select();
        };
        // A hidden sidebar is inert until it shows
        if (document.querySelector('.sidebar.hidden')) {
          toggleSidebar();
          requestAnimationFrame(focusSearch);
        } else {
          focusSearch();
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
  }, [createNote, toggleSidebar, flushSave, mac]);
}
