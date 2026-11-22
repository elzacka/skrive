import { useState, useRef, useEffect, useCallback } from 'react';
import type { EditorView } from '@codemirror/view';
import type { FileSystemFileHandle } from '@/types';
import type { SaveStatus } from '@/contexts/AppContext';
import { i18n } from '@/utils/i18n';
import { verifyPermission } from '@/utils/fileSystem';
import { readOpenedFile, writeOpenedFile, type OpenedFile, type OpenResult } from '@/utils/openFile';
import { DocumentEditor, SaveStatusIndicator, CopyButton } from './DocumentEditor';
import '@/styles/main.css';

// The same pause as for notes
const SAVE_DELAY = 800;

// From the browser: the app's own setting lives in the encrypted notes
const lang = navigator.language.toLowerCase().startsWith('en') ? 'en' : 'no';

type Problem = 'denied' | 'changed' | 'failed';
type OpenError = Exclude<OpenResult['kind'], 'ok'> | 'none';

// A file opened from Finder or File Explorer, edited where it lies. Nothing
// of it enters the notes, the history or a backup
export function FileWindow({ launched }: { launched: Promise<FileSystemFileHandle> | null }) {
  const t = i18n[lang];
  const [file, setFile] = useState<OpenedFile | null>(null);
  const [openError, setOpenError] = useState<{ kind: OpenError; name?: string } | null>(launched ? null : { kind: 'none' });
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [problem, setProblem] = useState<Problem | null>(null);

  const viewRef = useRef<EditorView | null>(null);
  const fileRef = useRef<OpenedFile | null>(null);
  const lastModifiedRef = useRef(0);
  const pendingRef = useRef<string | null>(null);
  const writingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const permissionRef = useRef<Promise<boolean> | null>(null);
  const overwriteRef = useRef(false);

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
      setContent(result.file.text);
      setFile(result.file);
      setOpenError(null);
    });
    return () => {
      cancelled = true;
      clearTimeout(hint);
    };
  }, [launched]);

  // One write at a time; edits made meanwhile go in the next one
  const save = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const current = fileRef.current;
    if (!current || writingRef.current || pendingRef.current === null) return;
    writingRef.current = true;
    try {
      if (!(await (permissionRef.current ??= verifyPermission(current.handle).catch(() => false)))) {
        setProblem('denied');
        setStatus('error');
        return;
      }
      while (pendingRef.current !== null) {
        const text = pendingRef.current;
        pendingRef.current = null;
        setStatus('saving');
        let result: number | Problem;
        try {
          result = await writeOpenedFile(current, text, overwriteRef.current ? null : lastModifiedRef.current);
        } catch {
          result = 'failed';
        }
        if (typeof result !== 'number') {
          pendingRef.current ??= text;
          setProblem(result);
          setStatus('error');
          return;
        }
        lastModifiedRef.current = result;
        overwriteRef.current = false;
      }
      setProblem(null);
      setStatus('saved');
    } finally {
      writingRef.current = false;
    }
  }, []);

  // Runs inside the input event: the first edit asks for write access
  // while the keystroke still counts as a user gesture
  const handleLiveChange = useCallback((text: string) => {
    const current = fileRef.current;
    if (!current) return;
    permissionRef.current ??= verifyPermission(current.handle).catch(() => false);
    pendingRef.current = text;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(save, SAVE_DELAY);
  }, [save]);

  const handleChange = useCallback((text: string) => {
    setContent(text);
    setStatus(prev => prev === 'error' ? prev : 'unsaved');
  }, []);

  const retry = () => {
    const current = fileRef.current;
    if (!current) return;
    if (problem === 'denied') permissionRef.current = verifyPermission(current.handle).catch(() => false);
    if (problem === 'changed') overwriteRef.current = true;
    save();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.code === 'KeyS') {
        e.preventDefault();
        save();
      }
    };
    const handleHide = () => {
      if (document.visibilityState === 'hidden') save();
    };
    // A write cannot finish during unload, so the browser asks first
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingRef.current === null && !writingRef.current) return;
      save();
      e.preventDefault();
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('visibilitychange', handleHide);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('visibilitychange', handleHide);
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

  const problemText = problem && { denied: t.fileSaveDenied, changed: t.fileChanged, failed: t.saveError }[problem];
  const statusText = { saving: t.saving, unsaved: t.unsaved, error: problemText ?? t.saveError, saved: t.saved }[status];

  return (
    <div className="app">
      {/* Not an alert: the save status already speaks the failure */}
      {problem && (
        <div className="storage-banner">
          <span>{problemText}</span>
          <span className="storage-banner-actions">
            <button className="storage-banner-close" onClick={retry}>
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
          onChange={handleChange}
          onLiveChange={handleLiveChange}
          viewRef={viewRef}
          actions={
            <>
              <div className="format-group">
                <SaveStatusIndicator status={status} text={statusText} />
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
