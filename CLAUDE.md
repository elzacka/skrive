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
- URL validation with `isSafeUrl()` before inserting links

## Icons

**IMPORTANT**: All icons MUST be self-hosted SVGs in src/components/Icons.tsx to ensure offline functionality.

- Use Material Symbols/Design icons converted to inline SVG paths
- Never load icons from external sources (Google Fonts, CDNs, etc.)
- Each icon is a React component that renders an inline `<svg>` element
- To add a new icon: find the SVG path from Material Symbols, create a new export function in Icons.tsx

## Export Formats

Richtext notes support multiple export formats:
- **HTML** - Native format
- **Markdown** - Converted from HTML via `htmlToMarkdown()`
- **RTF** - For Word, WordPad, TextEdit, LibreOffice via `htmlToRtf()`

Conversion functions in `src/utils/helpers.ts`.

## Versioning

The authoritative version is in `src/components/Sidebar.tsx` (app-footer section). Update package.json to match.

**IMPORTANT**: Before each commit to GitHub that includes code changes, new features, or fixes:
1. Update the version number in src/components/Sidebar.tsx
2. Update package.json to match
3. Use semantic versioning: MAJOR.MINOR.PATCH
   - PATCH: Bug fixes, small improvements
   - MINOR: New features, non-breaking changes
   - MAJOR: Breaking changes

**DO NOT** update version for documentation-only changes (README.md, CLAUDE.md, comments, etc.)

**Exception**: Privacy files (personvern.html, privacy.html) have separate versioning.
