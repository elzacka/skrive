# Skrive

Encrypted, offline-first note-taking PWA for desktop browsers.

## Platform

- Desktop only, minimum viewport 1024px. No mobile CSS, touch handlers, or responsive layouts — the exception is `ScreenGate` (src/components/ScreenGate.tsx), which replaces the app on phones (coarse pointer + small viewport, either orientation) and covers it under a 768px window width.
- The app never mounts on phones (notes are per-device; mounting would create stranded first-run state), and once mounted it never unmounts on a viewport change (a debounced save could be pending).
- Gate text reads `navigator.language` directly — no app state exists before mount.

## Storage

- App state lives in IndexedDB (`skrive-data`/`state`), reading and migrating legacy localStorage blobs (`skrive-encrypted`, `skrive-state`) once. Saves debounce 800 ms in AppContext; `saveStatus` reflects the real write result.
- On `pagehide` with a pending save, an encrypted copy goes to localStorage (`skrive-emergency`) synchronously, since async IndexedDB can't finish during unload; it's treated as newest on next load, then cleared.
- If stored data exists but fails to read at startup, it's preserved under an IndexedDB recovery key with a warning banner — a save must never overwrite data the app hasn't successfully read.
- `navigator.storage.persist()` is requested on every browser at startup; the result shows in the privacy popup.

## Security

- Notes are encrypted with AEGIS-256 (AES-accelerated) or XChaCha20-Poly1305 (fallback). The master key lives in IndexedDB (`skrive-crypto`), wrapped by a non-extractable WebCrypto AES-GCM key; legacy plaintext localStorage keys are migrated on startup.
- CSP is set in vite.config.ts, not meta — `frame-ancestors` in a meta CSP is ignored by browsers, so main.tsx refuses to render when framed.
- DOMPurify (strict whitelist) and `isSafeUrl()` run on write — editor input, JSON import, backup restore — not only on render.
- No runtime-loaded external dependencies; fonts and icons are self-hosted.

## Icons

- All icons are self-hosted inline SVGs in src/components/Icons.tsx (Lucide, ISC, inlined from lucide-static v1.25.0) — never load from a CDN or npm runtime package.
- Icons are stroke-based (`fill="none"`, `stroke="currentColor"`); color them via CSS `stroke`, not `fill` — a `fill` rule overrides `fill="none"` and turns them into solid blobs.
- To add one, copy the inner SVG elements from Lucide's source into a new export following the existing `icon()` helper.

## Auto-backup

- File System Access API only (Chrome/Edge); Firefox/Safari show an info message instead.
- Writes `skrive-auto-backup.json` to a user-chosen folder, 5 s after notes/tags/folders change. `writeAutoBackup()` skips `verifyPermission()` to avoid prompting during background saves.
- Payload is encrypted with the master key; the key itself travels wrapped with a passphrase-derived key (PBKDF2-HMAC-SHA256, 600000 iterations, AES-GCM) set via `PassphraseDialog`. Legacy plaintext backups are still readable for restore but never written.
- Directory/backup permission is only queried at startup, never requested — `requestPermission` without a user gesture auto-denies. An expired permission sets `backupPermissionNeeded`; the popup offers reactivation.
- If local data is missing but a backup handle exists: plaintext backups restore automatically; encrypted ones prompt for a passphrase first, and auto-backup disarms while that dialog is open (or after cancel) so the file isn't overwritten by fresh empty state.

## Startup

- New users get an empty richtext note auto-selected; returning users get the most recently updated note (no seeded welcome note).
- `initRef` guards against double init in StrictMode; `loadedRef` blocks saves until the initial load finishes.

## Editor

- Richtext undo/redo uses the browser's native stack (`execCommand('undo'/'redo')`); the custom `useUndoRedo` history is for plaintext/markdown only — applying history state to a contentEditable desyncs DOM and state.
- Find/replace (Cmd/Ctrl+F, FindReplaceBar): textarea formats match by index; richtext walks text nodes via the CSS Custom Highlight API, so a match split across inline tags won't highlight.
- Cmd/Ctrl+K focuses search globally but opens the link dialog when an editor has focus; the global handler skips on `e.defaultPrevented` or a contentEditable focus target (React 19 flushes discrete events synchronously, so listener order isn't reliable).
- Switching formats converts content: richtext↔markdown via `htmlToMarkdown()`/`markdownToHtml()`; plaintext→richtext escapes and wraps lines. The same helpers (src/utils/helpers.ts) drive HTML/Markdown/RTF export, RTF via `htmlToRtf()`.
- Deleting a note shows a 6 s undo toast, no confirm; folder deletion confirms because it's recursive.
- Sidebar multi-select follows Finder conventions (Cmd/Ctrl+Click toggle, Shift+Click ranges over `visibleNoteIds`'s render order); bulk delete goes through `deleteNotes()` and shares the undo toast.
- Moving notes out of a folder: drop on the tree background, drop on another note, or "Flytt ut av mappen" in the context menu. Drop handlers stop propagation so the background handler only fires on true background drops.
- No custom install prompt — don't intercept `beforeinstallprompt`; the browser's own address-bar icon is the only install affordance.
- There's no separate title field: in an unnamed note, the first line plus Enter becomes the name via `captureNoteName()` and is removed from the content. Renaming is inline via the sidebar context menu.

### contentEditable invariants

- `defaultParagraphSeparator` is `p`, `styleWithCSS` off, set at mount.
- Empty notes seed `<p><br></p>` — a bare text node at the editor root breaks execCommand nesting.
- A caret anchored on the editor root gets normalized into the block at that offset.
- After removing input-rule trigger text, replace the emptied text node with `<br>` before calling execCommand, or Chrome formats the previous block.

## Keyboard

- All shortcut checks use `e.code`, never `e.key` — with Shift/Alt held, `e.key` reports the shifted character and varies by layout (Norwegian Shift+8 is `(`).
- Headings: Cmd+Opt+1/2/3/0 (Mac), Ctrl+1/2/3/0 (Windows — Ctrl+Alt collides with AltGr). Cmd/Ctrl+U underline, Cmd/Ctrl+Shift+X strikethrough, Cmd/Ctrl+K link.
- App-level: Opt+letter (Mac) / Ctrl+Shift+digit (Windows) — N/1 new note, F/2 new folder, M/3 toggle sidebar, T/4 new tag. Never reuse a browser-chrome combo (Cmd/Ctrl+N/T/W/Tab, Shift+N/T/P, F5, F11, F12).
- Shortcut labels have one source: `getShortcutLabels()` in src/utils/shortcuts.ts.
- The sidebar tree is a keyboard-navigable ARIA tree (roving tabindex), scoped to tree focus. Its keydown handler must bail when `e.target` is an INPUT, and reads the current row from `document.activeElement`'s `data-item-id`, not from state.

## Versioning (differs from global)

- The version lives in src/components/Sidebar.tsx (app-footer) and package.json; bump both before any push that changes code, not for docs-only changes.
- Privacy files (personvern.html, privacy.html) version separately.

## i18n

All UI strings live in src/utils/i18n.ts, typed via `I18nStrings` in src/types/index.ts. Norwegian is the default language; English is supported.
