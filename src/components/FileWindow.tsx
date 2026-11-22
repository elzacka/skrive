import { useState, useRef, useEffect, useCallback } from 'react';
import type { EditorView } from '@codemirror/view';
import type { FileSystemFileHandle } from '@/types';
import type { SaveStatus } from '@/contexts/AppContext';
import { i18n } from '@/utils/i18n';
import { isMac } from '@/utils/helpers';
import { getShortcutLabels } from '@/utils/shortcuts';
import { verifyPermission } from '@/utils/fileSystem';
import { readOpenedFile, writeOpenedFile, type OpenedFile, type OpenResult } from '@/utils/openFile';
import { DocumentEditor, SaveStatusIndicator, CopyButton } from './DocumentEditor';
import { DeviceFloppyIcon } from './Icons';
import '@/styles/main.css';

// From the browser: the app's own setting lives in the encrypted notes
const lang = navigator.language.toLowerCase().startsWith('en') ? 'en' : 'no';

type Problem = 'denied' | 'changed' | 'failed';
type OpenError = Exclude<OpenResult['kind'], 'ok'> | 'none';

// A file opened from Finder or File Explorer, edited where it lies and
// saved only when the user saves. Nothing of it enters the notes, the
// history or a backup
export function FileWindow({ launched }: { launched: Promise<FileSystemFileHandle> | null }) {
  const t = i18n[lang];
  const saveShortcut = getShortcutLabels(isMac()).save;
  const [file, setFile] = useState<OpenedFile | null>(null);
  const [openError, setOpenError] = useState<{ kind: OpenError; name?: string } | null>(launched ? null : { kind: 'none' });
  const [content, setContent] = useState('');
  const [savedText, setSavedText] = useState('');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  const viewRef = useRef<EditorView | null>(null);
  const fileRef = useRef<OpenedFile | null>(null);
  const lastModifiedRef = useRef(0);
  // The editor's text on every keystroke, ahead of React's render
  const liveTextRef = useRef('');
  const savedTextRef = useRef('');
  const savingRef = useRef(false);

  useEffect(() => {
    document.documentElement.lang = lang === 'no' ? 'nb' : 'en';
    if (!launched) return;
    let cancelled = false;
    // A reload gets no launch: the file has to be opened again
    const hint = setTimeout(() => setOpenError(prev => prev ?? { kind: 'none' }), 1000);
    launched.then(async handle => {
      const result = await readOpenedFile(handle);
      if (cancelled) return;
      clearTimeout(hint);
      document.title = handle.name;
      if (result.kind !== 'ok') {
        setOpenError({ kind: result.kind, name: handle.name });
        return;
      }
      fileRef.current = result.file;
      lastModifiedRef.current = result.file.lastModified;
      liveTextRef.current = savedTextRef.current = result.file.text;
      setContent(result.file.text);
      setSavedText(result.file.text);
      setFile(result.file);
      setOpenError(null);
    });
    return () => {
      cancelled = true;
      clearTimeout(hint);
    };
  }, [launched]);

  // Called from a click or Cmd/Ctrl+S, so a permission prompt may show
  const save = useCallback(async (overwrite = false) => {
    const current = fileRef.current;
    const text = liveTextRef.current;
    if (!current || savingRef.current) return;
    if (text === savedTextRef.current && !overwrite) return;
    savingRef.current = true;
    setSaving(true);
    try {
      if (!(await verifyPermission(current.handle).catch(() => false))) {
        setProblem('denied');
        return;
      }
      const result = await writeOpenedFile(current, text, overwrite ? null : lastModifiedRef.current).catch(() => 'failed' as const);
      if (typeof result !== 'number') {
        setProblem(result);
        return;
      }
      lastModifiedRef.current = result;
      savedTextRef.current = text;
      setSavedText(text);
      setProblem(null);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, []);

  const handleLiveChange = useCallback((text: string) => {
    liveTextRef.current = text;
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.code === 'KeyS') {
        e.preventDefault();
        save();
      }
    };
    // The browser's own leave dialog: a page cannot offer Save there
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (liveTextRef.current !== savedTextRef.current) e.preventDefault();
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [save]);

  if (!file) {
    if (!openError) return null;
    const message = { none: t.fileNoneBody, tooLarge: t.fileTooLarge, notText: t.fileNotText, failed: t.fileOpenFailed }[openError.kind];
    return (
      <div className="screen-gate">
        <h1>{openError.name ?? t.fileNoneTitle}</h1>
        <p>{message}</p>
      </div>
    );
  }

  const dirty = content !== savedText;
  const status: SaveStatus = saving ? 'saving' : problem ? 'error' : dirty ? 'unsaved' : 'saved';
  const problemText = problem && { denied: t.fileSaveDenied, changed: t.fileChanged, failed: t.saveError }[problem];
  const statusText = { saving: t.saving, unsaved: t.unsaved, error: problemText ?? t.saveError, saved: t.saved }[status];

  return (
    <div className="app">
      {/* Not an alert: the save status already speaks the failure */}
      {problem && (
        <div className="storage-banner">
          <span>{problemText}</span>
          <span className="storage-banner-actions">
            <button className="storage-banner-close" onClick={() => save(problem === 'changed')}>
              {problem === 'changed' ? t.fileOverwrite : t.fileRetry}
            </button>
          </span>
        </div>
      )}
      <div className="main-content">
        <DocumentEditor
          lang={lang}
          docId="file"
          content={content}
          revision={0}
          placeholder={t.writeHere}
          onChange={setContent}
          onLiveChange={handleLiveChange}
          viewRef={viewRef}
          autoFocus={false}
          actions={
            <>
              <div className="format-group">
                <SaveStatusIndicator status={status} text={statusText} />
                <button
                  className="action-btn icon-btn"
                  onClick={() => save()}
                  disabled={!dirty || saving}
                  title={`${t.fileSave} (${saveShortcut})`}
                  aria-label={t.fileSave}
                >
                  <DeviceFloppyIcon size={15} />
                </button>
              </div>
              <div className="format-group">
                <CopyButton content={content} lang={lang} />
              </div>
            </>
          }
          footer={<span className="note-modified">{file.handle.name}</span>}
        />
      </div>
    </div>
  );
}
