# Skrive

Encrypted, offline-first note-taking PWA for desktop browsers.

- Verify: `npm run lint && npm run build`. No automated tests; check in `npm run dev` at `localhost:5173/skrive/`. CI (`deploy.yml`) runs only `npm run build`.
- Push to `main` deploys to GitHub Pages at `/skrive/`.

Security scope: OWASP ASVS L2 (latest released edition), Top 10, WSTG, CI/CD Top 10. Not API or LLM Top 10: no own API, no LLM feature.

## Platform

- Desktop only, minimum viewport 1024px. No mobile CSS, touch handlers, or responsive layouts — the exception is `ScreenGate` (src/components/ScreenGate.tsx), which replaces the app on phones (coarse pointer + small viewport, either orientation) and covers it under a 768px window width.
- The app never mounts on phones (notes are per-device; mounting would create stranded first-run state), and once mounted it never unmounts on a viewport change (a debounced save could be pending).
- Gate text reads `navigator.language` directly — no app state exists before mount.

## Storage

- App state lives in IndexedDB (`skrive-data`/`state`), reading and migrating legacy localStorage blobs (`skrive-encrypted`, `skrive-state`) once. Saves debounce 800 ms in AppContext; `saveStatus` reflects the real write result.
- On `pagehide` with a pending save, an encrypted copy goes to localStorage (`skrive-emergency`) synchronously, since async IndexedDB can't finish during unload; it's treated as newest on next load, then cleared.
- If stored data exists but fails to read at startup, it's preserved under its own `encrypted-state-recovery-<ts>` key (never overwritten) — a save must never overwrite data the app hasn't successfully read. While any copy exists, a banner offers recovery (device key, then the auto-backup passphrase key) and auto-backup pauses. A backup restore also tries its key on waiting copies.
- The master key never changes once created: a stored key that can't be read blocks the app (`startupBlocked`) instead of being replaced, and restores re-encrypt with the device key. The only way to a new key is the confirmed reset on that screen, which keeps the old record under a dated id. An IndexedDB read error at startup blocks the same way.
- One window at a time (Web Locks, main.tsx): each window saves the whole state, so a second one waits behind `InstanceGate`.
- Restore and JSON import merge by id (newer `updatedAt` wins); they never remove notes. A note stays in the trash when it was deleted here after the incoming copy's last edit.
- Deleted notes go to `state.trash` (`TrashedNote`, `deletedAt`) for `TRASH_DAYS`, expired at startup. Encrypted backups carry the trash; the plain JSON export leaves it out. An untouched placeholder is discarded, not trashed.
- Note history: `recordVersion()` keeps the text as last saved before an edit, stamped with when it was written, at most every 10 minutes, under its own encrypted `note-history-<id>` key (never in backups). Kept `HISTORY_DAYS`; pruned at startup unless a recovery copy waits, deleted with a note purged from the trash. History another key wrote moves to `unreadable-history-*`, never overwritten.
- `navigator.storage.persist()` is requested on every browser at startup; the result shows in the privacy popup.

## Security

- Notes are encrypted with AEGIS-256 (AES-accelerated) or XChaCha20-Poly1305 (fallback). The master key lives in IndexedDB (`skrive-crypto`), wrapped by a non-extractable WebCrypto AES-GCM key; legacy plaintext localStorage keys are migrated on startup.
- CSP is a `<meta>` tag injected by vite.config.ts (dev and prod variants); GitHub Pages sends no headers. Meta ignores `frame-ancestors`, so main.tsx refuses to render when framed.
- Notes hold Markdown text; HTML is sanitized (DOMPurify, strict whitelist) on the way in (paste, conversion of old notes) and out (`markdownToHtml()` for copy and export). `isSafeUrl()` gates every link that is rendered or opened.
- No runtime-loaded external dependencies; fonts and icons are self-hosted.
- No outbound request: notes are personal data, so the prod CSP names no external host.

## Icons

- All icons are self-hosted inline SVGs in src/components/Icons.tsx (Tabler Icons outline set, MIT; source version in the file header) — never load from a CDN or npm runtime package, and never mix in another icon set.
- Icons are stroke-based (`fill="none"`, `stroke="currentColor"`); color them via CSS `stroke`, not `fill` — a `fill` rule overrides `fill="none"` and turns them into solid blobs.
- To add one, copy the inner SVG elements (minus the `stroke="none"` bounding-box path) from Tabler's `icons/outline/<name>.svg` into a new export following the existing `icon()` helper.

## Auto-backup

- File System Access API only (Chrome/Edge); Firefox/Safari show an info message instead.
- Writes `skrive-auto-backup.json` to a user-chosen folder, 5 s after notes/tags/folders change. `writeAutoBackup()` skips `verifyPermission()` to avoid prompting during background saves; a failed write re-queries permission.
- Before the first write of each session and day, the previous file is kept as `skrive-auto-backup-<date-time>.json` (10 newest). Manual restore opens a file picker, so any of them can be restored.
- Payload is encrypted with the master key; the key itself travels wrapped with a passphrase-derived key (PBKDF2-HMAC-SHA256 with `PBKDF2_ITERATIONS` in src/utils/crypto.ts, AES-GCM) set via `PassphraseDialog`. Legacy plaintext backups are still readable for restore but never written.
- "Eksporter alle som Markdown-filer" (`exportNotesToFolder()`) writes into a new dated subfolder of the chosen folder, so nothing there is overwritten.
- The protection carries `keyCheck` (SHA-256 of the wrapped key). If it doesn't fit the device key (or the key was just created), `backupKeyStale` stops writes until the passphrase is entered again, since a payload under one key with a protection for another opens with no passphrase.
- Directory/backup permission is only queried at startup, never requested — `requestPermission` without a user gesture auto-denies. An expired permission sets `backupPermissionNeeded`; the popup offers reactivation, whose prompt lets the user allow on every visit (installed apps keep access by default).
- If local data is missing but a backup handle exists (at startup or on reactivation): plaintext backups restore automatically; encrypted ones prompt for a passphrase first, and auto-backup disarms while that dialog is open (or after cancel) so the file isn't overwritten by fresh empty state.

## Startup

- New notes go through `buildNote()` in AppContext.tsx.
- New users get an empty note auto-selected; returning users get the most recently updated note (no seeded welcome note).
- `initRef` guards against double init in StrictMode; `loadedRef` blocks saves until the initial load finishes.

## Editor

- One format: notes are Markdown text (`format: 'markdown'`). Older `richtext`/`plaintext` notes, backups and imports convert once via `toMarkdownNote()` (AppContext); the loaded state before the first conversion is kept once, encrypted, under `encrypted-state-pre-markdown` and deleted after 30 days.
- CodeMirror 6 (src/components/MarkdownEditor.tsx, src/editor/) in a shadow root: CodeMirror injects styles, and only `adoptedStyleSheets` there pass the prod CSP. Editor CSS is src/styles/editor.css, loaded `?inline`.
- Two lenses on the same text: `markdownLens(false)` hides marks unless the selection touches them; `markdownLens(true)` shows them dimmed. Toggle: Cmd/Ctrl+. or "MD".
- Font, size and line spacing ("Aa") are a per-device preference in localStorage (`skrive-typography`, src/utils/typography.ts), set as CSS variables on `.editor-container`. Recursive's MONO axis follows the lens (`--editor-mono`). Font files and OFL licenses: public/fonts.
- editor.css selectors need one class more than CodeMirror's base theme (e.g. `.cm-editor .cm-scroller`): it loads later at equal specificity and wins silently.
- Toolbar order follows word processors: undo/redo, style and font, character, link, block, view; right: status and history, tags/copy/export, delete last.
- Import only `markdownLanguage` and named commands from `@codemirror/lang-markdown`: `markdown()` bundles HTML, CSS and JavaScript support (about 70 kB gzip).
- Edits reach React after the input event (`setTimeout`, coalesced, with the note id): inside it they get sync priority and hit React's nested-update limit while typing fast. Pending edits flush on note switch and unmount. Each keystroke also goes to `trackLiveEdit()` without React, and the `pagehide` spill and hidden-tab save apply it, since an unload can come before the edit renders.
- The editor takes outside content only when `mergeRevision` changes (restore, import); comparing content would take a stale render for an outside edit. Find/replace and naming write through the view.
- Render, copy and export go through src/utils/markdown.ts on the editor's own parser; `htmlToMarkdown()` sanitizes, `markdownToHtml()` output is sanitized. Soft line breaks render as `<br>`.
- Find/replace (Cmd/Ctrl+F): matches by index in the text, highlights via `setFindMatches`.
- Cmd/Ctrl+K inserts a link in the editor and focuses search elsewhere; the global handler skips on `e.defaultPrevented` or a contentEditable `composedPath()[0]`.
- Deleting a note shows a 6 s undo toast, no confirm; folder deletion confirms because it's recursive. Both send notes to the trash.
- Modal dialogs carry `role="dialog"` and `aria-modal="true"`: global shortcuts (except Cmd/Ctrl+S) and the sidebar's Delete/Backspace skip while one is open; the editor takes focus after it closes, only if nothing else did.
- Sidebar multi-select follows Finder conventions (Cmd/Ctrl+Click toggle, Shift+Click ranges over `visibleNoteIds`'s render order); bulk delete goes through `deleteNotes()` and shares the undo toast.
- Moving notes out of a folder: drop on the tree background, drop on another note, or "Flytt ut av mappen" in the context menu. Drop handlers stop propagation so the background handler only fires on true background drops.
- Escape closes dialogs, popups and context menus everywhere.
- No custom install prompt — don't intercept `beforeinstallprompt`; the browser's own address-bar icon is the only install affordance.
- There's no separate title field: in an unnamed note, the first line plus Enter becomes the name via `captureNoteName()` and is removed from the content; `namedRef` stops a second capture before React renders the title. Renaming is inline via the sidebar context menu.

## Keyboard

- All shortcut checks use `e.code`, never `e.key` — with Shift/Alt held, `e.key` reports the shifted character and varies by layout (Norwegian Shift+8 is `(`).
- The combo list is `getShortcutLabels()` in src/utils/shortcuts.ts (labels only); keep the handlers in step with it. Windows avoids Ctrl+Alt (collides with AltGr) and Ctrl+digit (Chrome's tabs and zoom), so headings there are typed Markdown. Never reuse a browser-chrome combo (Cmd/Ctrl+N/T/W/Tab, Shift+N/T/P, F5, F11, F12).
- The sidebar tree is a keyboard-navigable ARIA tree (roving tabindex), scoped to tree focus. Its keydown handler must bail when `e.target` is an INPUT, and reads the current row from `document.activeElement`'s `data-item-id`, not from state.

## Versioning (differs from global)

- The version lives in package.json; the guide popup ("Bruke appen") shows it via `__APP_VERSION__` (vite.config.ts `define`). Bump before any push that changes code, not for docs-only changes.
- Privacy files (personvern.html, privacy.html) version separately.

## i18n

All UI strings live in src/utils/i18n.ts, typed via `I18nStrings` in src/types/index.ts. Norwegian is the default language; English is supported.
