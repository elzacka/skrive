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

## Storage and Persistence

- Encrypted app state lives in IndexedDB (DB `skrive-data`, store `state`); legacy localStorage blobs (`skrive-encrypted`, `skrive-state`) are read once and migrated on next save
- Saves are debounced 800 ms in AppContext; `saveStatus` in the context reflects the real write result and drives the editor indicator
- On `pagehide` with a pending save, an encrypted copy is written synchronously to localStorage (`skrive-emergency`) because async IndexedDB writes cannot complete during unload; it is loaded (it is always newest) and cleaned up on next startup
- If stored data exists but cannot be read at startup, it is preserved under an IndexedDB recovery key and a warning banner is shown; a save must never overwrite data the app has not successfully read
- `navigator.storage.persist()` is requested on all browsers at startup; the result is shown in the privacy popup

## Security

- All notes encrypted with AEGIS-256 (AES-accelerated) or XChaCha20-Poly1305 (fallback)
- Master key stored in IndexedDB (DB `skrive-crypto`), wrapped with a non-extractable WebCrypto AES-GCM key; legacy plaintext localStorage keys are migrated on startup
- CSP headers configured in vite.config.ts (no unsafe-inline); `frame-ancestors` in meta CSP is ignored by browsers, so main.tsx refuses to render when framed
- Sanitization (DOMPurify strict whitelist) and URL validation (`isSafeUrl()`, protocol allowlist) centralized in src/utils/sanitize.ts
- Richtext content is sanitized on write (editor input, JSON import, backup restore), not only on render
- No external dependencies loaded at runtime (fonts, icons self-hosted)

## Icons

**IMPORTANT**: All icons MUST be self-hosted SVGs in src/components/Icons.tsx to ensure offline functionality.

- Icon set is Lucide (https://lucide.dev, ISC license), inlined from lucide-static v1.25.0
- Never load icons from external sources (fonts, CDNs, npm runtime packages)
- Each icon is a React component rendering an inline stroke-based `<svg>` (fill="none", stroke="currentColor")
- To add a new icon: copy the inner SVG elements from the official Lucide SVG into a new export in Icons.tsx following the existing `icon()` helper pattern
- CSS that colors icons must set `stroke` (not `fill`); a CSS `fill` rule overrides the SVG's `fill="none"` attribute and turns stroke icons into solid blobs

## App Startup Behavior

- First-time users: A new richtext note is created and selected automatically
- Returning users: The most recently updated note is selected automatically
- New notes default to richtext everywhere (`createNote` default)
- If local data is missing but an auto-backup handle exists: legacy plaintext backups restore automatically; encrypted backups show a passphrase dialog first. While that dialog is open (or after cancel), auto-backup is disarmed so the backup file cannot be overwritten with the fresh empty state
- Directory/backup handle permissions are only queried (never requested) at startup: `requestPermission` without a user gesture is auto-denied. An expired backup permission sets `backupPermissionNeeded` and the backup popup offers reactivation
- Note creation logic is centralized in `buildNote()` helper in AppContext.tsx
- `initRef` guard prevents double initialization in React StrictMode; `loadedRef` blocks saves until the initial load finished

## Auto-Backup

- Uses the File System Access API (Chrome/Edge only)
- Writes `skrive-auto-backup.json` to a user-chosen local folder
- Debounced: writes 5 seconds after notes/tags/folders change
- Backup payload is encrypted with the master key; the master key is included wrapped with a passphrase-derived key (PBKDF2-HMAC-SHA256, 600000 iterations, AES-GCM)
- The user sets the passphrase when enabling auto-backup (`PassphraseDialog`); restore asks for it
- Legacy plaintext backups are still readable for restore but never written
- `writeAutoBackup()` skips `verifyPermission()` to avoid prompts during background saves
- The backup effect is gated on `pendingRestoreState === null` and `!backupPermissionNeeded`
- `lastBackupTime` is persisted in localStorage (`skrive-last-backup`)
- Backup handle and passphrase-wrapped key stored in IndexedDB (`skrive-backup-handle`, `skrive-backup-key-protection`)
- Firefox/Safari: feature unavailable, shows info message
- Core logic in src/utils/fileSystem.ts, state management in src/contexts/AppContext.tsx

## Editor Behavior

- Richtext undo/redo uses the browser's native undo stack (buttons and shortcuts both call `document.execCommand('undo'/'redo')`); the custom `useUndoRedo` history applies only to plaintext/markdown. Applying history state to a contentEditable would desync DOM and state
- Find and replace: Cmd/Ctrl+F opens `FindReplaceBar` (src/components/FindReplaceBar.tsx). Textarea formats use index-based matching; richtext walks text nodes and highlights via the CSS Custom Highlight API. Richtext matches are per-text-node, so text split by inline tags is not matched
- Cmd/Ctrl+K focuses search globally but opens the link dialog when either editor has focus; the global handler skips when `e.defaultPrevented` or focus is in a contentEditable (React 19 flushes discrete-event state synchronously, so listener order cannot be relied on)
- Switching formats converts content: richtext to markdown via `htmlToMarkdown()`, markdown to richtext via `markdownToHtml()`, plaintext to richtext escapes and wraps lines
- Deleting a note shows a 6-second undo toast (no confirm dialog); folder deletion keeps a confirm because it is recursive
- Sidebar multi-select (Finder conventions): Cmd/Ctrl+Click toggles, Shift+Click ranges over the VISIBLE render order (`visibleNoteIds` in Sidebar.tsx), right-click inside the selection offers "Slett (N)", Delete/Backspace deletes when focus is not in an input/editor, Escape or plain click clears. Bulk delete goes through `deleteNotes()` in AppContext and shares the undo toast
- Moving notes out of folders: drop on the tree background (root), drop on another note (that note's location), or the "Flytt ut av mappen" context-menu item (applies to the multi-selection). Folder and note drop handlers stopPropagation so the background handler only catches true background drops
- There is NO custom PWA install prompt: the browser's native address-bar install icon is the only install affordance (do not intercept `beforeinstallprompt`)
- Escape closes dialogs, popups, and context menus everywhere
- There is NO separate title field. Naming flow: in an UNNAMED note (title empty or a default), the first line plus Enter becomes the note's name via `captureNoteName()` and is REMOVED from the content, so exports contain only actual content. The empty-note placeholder explains this; once named, the placeholder switches to a plain prompt. Renaming happens via the sidebar context menu (inline edit, like folders)
- First-run users get an empty richtext note; onboarding is the naming placeholder plus the guide popup (no seeded welcome note)

### Richtext input rules (src/components/Editor.tsx, RichTextEditor)

- Markdown-style triggers on `beforeinput`: `- `, `* `, `1. `, `# `..`### `, `> ` at line start; `**bold**`/`*italic*` inline; URLs auto-link on space. All rules are layout-independent (semantic input events, not keydown)
- Smart paste: a URL pasted over a selection becomes a link; plain-text markdown pastes are converted via `markdownToHtml()`
- Selection bubble: selecting text shows a floating B/I/U/S/link/quote menu; flips below the selection when there is no room above
- contentEditable invariants (hard-won, do not regress): `defaultParagraphSeparator` is `p` and `styleWithCSS` is off (set at mount); empty notes are seeded with `<p><br></p>` because bare text nodes at the editor root break execCommand nesting; a caret anchored on the editor root is normalized into the block at that offset; after removing input-rule trigger text, the emptied text node must be replaced with `<br>` before calling execCommand, or Chrome formats the PREVIOUS block

### Keyboard shortcuts

- All shortcut checks use `e.code` (physical key), never `e.key`: with Shift/Alt held, `e.key` reports the shifted character and varies by layout (Norwegian Shift+8 is `(`)
- Headings: Cmd+Opt+1/2/3/0 on Mac (Cmd+digit switches browser tabs), Ctrl+1/2/3/0 on Windows (Ctrl+Alt would collide with AltGr)
- Cmd/Ctrl+U underline, Cmd/Ctrl+Shift+X strikethrough, Cmd/Ctrl+K link (both editors)

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
