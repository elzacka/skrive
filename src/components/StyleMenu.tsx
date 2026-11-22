import { useEffect, useRef } from 'react';
import { usePopover } from '@/hooks';
import { ChevronDownIcon } from './Icons';

interface StyleOption {
  label: string;
  shortcut: string;
}

interface StyleMenuProps {
  label: string;
  options: StyleOption[];
  // null when the text has a style the menu does not offer (heading 4-6)
  value: number | null;
  // Shown on the trigger when value is null
  otherLabel: string;
  onSelect: (value: number) => void;
}

// Text style picker. A native select can't show the shortcuts: macOS menus
// ignore option tooltips
export function StyleMenu({ label, options, value, otherLabel, onSelect }: StyleMenuProps) {
  const { open, setOpen, triggerRef, rootProps } = usePopover();
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (open) itemRefs.current[value ?? 0]?.focus();
  }, [open, value]);

  const choose = (index: number) => {
    setOpen(false);
    onSelect(index);
  };

  const handleMenuKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    // The toolbar's arrow keys stay out of it
    e.stopPropagation();
    const index = itemRefs.current.indexOf(document.activeElement as HTMLButtonElement);
    const step = e.key === 'ArrowDown' ? 1 : options.length - 1;
    itemRefs.current[(index + step) % options.length]?.focus();
  };

  const current = value === null ? null : options[value];
  const currentLabel = current?.label ?? otherLabel;

  return (
    <div className="style-menu" {...rootProps}>
      <button
        ref={triggerRef}
        className="style-select"
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setOpen(true); } }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${currentLabel}`}
        title={current?.shortcut ? `${current.label} (${current.shortcut})` : currentLabel}
      >
        <span>{currentLabel}</span>
        <ChevronDownIcon size={14} />
      </button>
      {open && (
        <div className="style-menu-list" role="listbox" aria-label={label} onKeyDown={handleMenuKey}>
          {options.map((option, i) => (
            <button
              key={option.label}
              ref={el => { itemRefs.current[i] = el; }}
              className="style-menu-item"
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
