import { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon } from './Icons';

interface StyleOption {
  label: string;
  shortcut: string;
}

interface StyleMenuProps {
  label: string;
  options: StyleOption[];
  value: number;
  onSelect: (value: number) => void;
}

// Text style picker. A native select can't show the shortcuts: macOS menus
// ignore option tooltips
export function StyleMenu({ label, options, value, onSelect }: StyleMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[value]?.focus();
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open, value]);

  const choose = (index: number) => {
    setOpen(false);
    onSelect(index);
  };

  const handleMenuKey = (e: React.KeyboardEvent) => {
    const index = itemRefs.current.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : options.length - 1;
      itemRefs.current[(index + step) % options.length]?.focus();
    } else if (e.key === 'Escape') {
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
      return;
    } else {
      return;
    }
    // The toolbar's arrow keys and the editor's Escape stay out of it
    e.stopPropagation();
  };

  const current = options[value];

  return (
    <div className="style-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        className="style-select"
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setOpen(true); } }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current.label}`}
        title={current.shortcut ? `${current.label} (${current.shortcut})` : current.label}
      >
        <span>{current.label}</span>
        <ChevronDownIcon size={14} />
      </button>
      {open && (
        <div className="style-menu-list" role="listbox" aria-label={label} onKeyDown={handleMenuKey}>
          {options.map((option, i) => (
            <button
              key={option.label}
              ref={el => { itemRefs.current[i] = el; }}
              className={`style-menu-item level-${i}`}
              role="option"
              aria-selected={i === value}
              title={option.shortcut ? `${option.label} (${option.shortcut})` : option.label}
              onClick={() => choose(i)}
            >
              <span>{option.label}</span>
              {option.shortcut && <kbd>{option.shortcut}</kbd>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
