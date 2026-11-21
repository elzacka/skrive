// Editor font, size and line spacing: a per-device display preference, not
// note data, so it lives in localStorage outside the encrypted state

export type EditorFont = 'recursive' | 'monaspace' | 'duo';
export type TextSize = 'small' | 'normal' | 'large';
export type LineSpacing = 'tight' | 'normal' | 'airy';

export interface Typography {
  font: EditorFont;
  size: TextSize;
  spacing: LineSpacing;
}

const KEY = 'skrive-typography';

export const DEFAULT_TYPOGRAPHY: Typography = { font: 'duo', size: 'normal', spacing: 'normal' };

// Alphabetical: the picker lists them in this order
export const FONTS: Record<EditorFont, { name: string; stack: string }> = {
  duo: { name: 'iA Writer Duo', stack: "'iA Writer Duo', var(--font-mono)" },
  monaspace: { name: 'Monaspace', stack: "'Monaspace Neon', var(--font-mono)" },
  recursive: { name: 'Recursive', stack: "'Recursive', var(--font-mono)" }
};

export const SIZES: Record<TextSize, number> = { small: 14, normal: 16, large: 18 };
export const SPACINGS: Record<LineSpacing, number> = { tight: 1.5, normal: 1.7, airy: 1.9 };

export function loadTypography(): Typography {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Typography>;
    return {
      font: stored.font && stored.font in FONTS ? stored.font : DEFAULT_TYPOGRAPHY.font,
      size: stored.size && stored.size in SIZES ? stored.size : DEFAULT_TYPOGRAPHY.size,
      spacing: stored.spacing && stored.spacing in SPACINGS ? stored.spacing : DEFAULT_TYPOGRAPHY.spacing
    };
  } catch {
    return DEFAULT_TYPOGRAPHY;
  }
}

export function saveTypography(typography: Typography): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(typography));
  } catch {
    // Private mode or full storage: the choice holds for this session
  }
}
