# CLAUDE.md - Skrive Project Instructions

## Platform Target

**Desktop only.** This app is designed exclusively for desktop browsers (Mac, Windows, Linux).

- Do NOT add mobile-specific CSS (media queries for max-width, touch targets, etc.)
- Do NOT add touch event handlers
- Do NOT consider responsive/mobile layouts
- Minimum supported viewport: 1024px width

## Tech Stack

- React 19 with TypeScript (strict mode)
- Vite 7 for bundling
- PWA with offline support (Service Worker via vite-plugin-pwa)
- IndexedDB for local storage
- libsodium for encryption (AEGIS-256 or XChaCha20-Poly1305)
- DOMPurify for HTML sanitization

## Code Style

- ES modules (import/export)
- Functional components with hooks
- No class components
- Prettier formatting
- No emojis in code, UI, or documentation

## Commands

```bash
npm run dev       # Start dev server (localhost:5173)
npm run build     # Production build (tsc + vite)
npm run lint      # ESLint
npm run preview   # Preview production build
```

## File Structure

```
src/
  components/     # React components (Editor, Sidebar, Icons, etc.)
  contexts/       # React context providers (AppContext)
  hooks/          # Custom hooks (useKeyboardShortcuts, useUndoRedo)
  styles/         # CSS (main.css)
  types/          # TypeScript types
  utils/          # i18n, crypto, storage, fileSystem, helpers
```

## Internationalization

- Norwegian (no) is default language
- English (en) supported
- All UI strings in src/utils/i18n.ts
- Types in src/types/index.ts (I18nStrings)
- **IMPORTANT**: Always use correct Norwegian characters (æ, ø, å). Never substitute with 'a' or 'o'.

## Security

- All notes encrypted with AEGIS-256 (AES-accelerated) or XChaCha20-Poly1305 (fallback)
- Encryption key derived from random bytes stored in IndexedDB
- CSP headers configured in vite.config.ts (no unsafe-inline)
- DOMPurify with strict whitelist for HTML sanitization
- No external dependencies loaded at runtime (fonts, icons self-hosted)

## Icons

All icons are self-hosted SVGs in src/components/Icons.tsx. Use Material Symbols/Design icons converted to inline SVG. Never load icons from external sources (Google Fonts, CDNs, etc.) to ensure offline functionality.
