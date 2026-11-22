import { useEffect, useRef, useState } from 'react';

// A popup anchored to its trigger: a click outside, focus moving out or
// Escape closes it, and Escape hands focus back to the trigger
export function usePopover<T extends HTMLElement = HTMLButtonElement>() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<T>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const rootProps = {
    ref: rootRef,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (!open || e.key !== 'Escape') return;
      // The editor's own Escape handling stays out of it
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    },
    // A click on a non-focusable spot inside has no relatedTarget
    onBlur: (e: React.FocusEvent) => {
      if (e.relatedTarget && !rootRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
    }
  };

  return { open, setOpen, triggerRef, rootProps };
}
