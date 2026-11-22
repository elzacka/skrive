import type { I18nStrings } from '@/types';
import { usePopover } from '@/hooks';
import { FONTS, type EditorFont, type LineSpacing, type TextSize, type Typography } from '@/utils/typography';

interface TypographyMenuProps {
  t: I18nStrings;
  value: Typography;
  onChange: (value: Typography) => void;
}

export function TypographyMenu({ t, value, onChange }: TypographyMenuProps) {
  const { open, setOpen, triggerRef, rootProps } = usePopover();

  const row = <K extends keyof Typography>(key: K, label: string, options: { id: Typography[K]; label: string; font?: string }[]) => (
    <div className="type-row" role="group" aria-label={label}>
      <span className="type-row-label">{label}</span>
      <div className="segmented">
        {options.map(option => (
          <button
            key={option.id}
            className={value[key] === option.id ? 'active' : ''}
            aria-pressed={value[key] === option.id}
            style={option.font ? { fontFamily: option.font } : undefined}
            onClick={() => onChange({ ...value, [key]: option.id })}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="type-menu" {...rootProps}>
      <button
        ref={triggerRef}
        className={`format-btn ${open ? 'active' : ''}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={t.textSettings}
        title={t.textSettings}
      >
        <span className="md-label" aria-hidden="true">Aa</span>
      </button>
      {open && (
        <div className="type-panel">
          {row('font', t.fontLabel, (Object.keys(FONTS) as EditorFont[]).map(id => ({ id, label: FONTS[id].name, font: FONTS[id].stack })))}
          {row('size', t.textSize, ([['small', t.sizeSmall], ['normal', t.normalOption], ['large', t.sizeLarge]] as [TextSize, string][]).map(([id, label]) => ({ id, label })))}
          {row('spacing', t.lineSpacing, ([['tight', t.spacingTight], ['normal', t.normalOption], ['airy', t.spacingAiry]] as [LineSpacing, string][]).map(([id, label]) => ({ id, label })))}
        </div>
      )}
    </div>
  );
}
