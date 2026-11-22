import { useEffect, type RefObject } from 'react';

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), textarea, select, a[href], [tabindex]:not([tabindex="-1"])';

// Keeps Tab inside a modal dialog; on close, focus goes back to the element
// that opened it, or to fallback, unless something else took it
export function useModal(ref: RefObject<HTMLElement | null>, fallback?: () => HTMLElement | null | undefined) {
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const trap = (e: KeyboardEvent) => {
      const dialog = ref.current;
      if (e.key !== 'Tab' || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const inside = dialog.contains(document.activeElement);
      if (e.shiftKey && (!inside || document.activeElement === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => {
      document.removeEventListener('keydown', trap);
      // After the close handlers, which may focus the editor themselves
      requestAnimationFrame(() => {
        for (const el of [opener, fallback?.()]) {
          if (document.activeElement && document.activeElement !== document.body) return;
          if (el?.isConnected) el.focus();
        }
      });
    };
    // The opener is read once, when the dialog opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
