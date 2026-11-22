import { useState, useRef, useEffect, useCallback, useDeferredValue, useMemo } from 'react';
import type { EditorView } from '@codemirror/view';
import { undo, redo } from '@codemirror/commands';
import { i18n } from '@/utils/i18n';
import { isMac } from '@/utils/helpers';
import { markdownToHtml, markdownToPlainText } from '@/utils/markdown';
import { isSafeUrl } from '@/utils/sanitize';
import { getShortcutLabels } from '@/utils/shortcuts';
import { toggleInline, toggleLines, toggleCodeBlock, setHeading, insertLink, type ActiveFormats, type InlineStyle, type LineStyle } from '@/editor/commands';
import { FindReplaceBar } from './FindReplaceBar';
import { MarkdownEditor } from './MarkdownEditor';
import { StyleMenu } from './StyleMenu';
import { TypographyMenu } from './TypographyMenu';
import { FONTS, SIZES, SPACINGS, loadTypography, saveTypography, type Typography } from '@/utils/typography';
import { useModal } from '@/hooks';
import type { SaveStatus } from '@/contexts/AppContext';
import {
  CopyIcon,
  UndoIcon,
  RedoIcon,
  BulletListIcon,
  NumberedListIcon,
  TaskListIcon,
  BoldIcon,
  ItalicIcon,
  CodeIcon,
  LinkIcon,
  CodeBlockIcon,
  QuoteIcon,
  CloseIcon,
  CheckIcon,
  CircleIcon,
  LoaderCircleIcon,
  CircleAlertIcon
} from './Icons';

const NO_FORMATS: ActiveFormats = { bold: false, italic: false, code: false, heading: 0, list: null };

function countWordsAndChars(content: string): { words: number; chars: number } {
  const text = markdownToPlainText(content);
  return { words: text.trim() === '' ? 0 : text.trim().split(/\s+/).length, chars: text.length };
}

// "MD" reads as Markdown at a glance; no icon set has a clearer mark
const MarkdownLabel = () => <span className="md-label" aria-hidden="true">MD</span>;

// The modal hook needs a component that mounts with the dialog
function LinkDialog({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useModal(ref);
  return (
    <div className="link-dialog-overlay" onClick={onClose}>
      <div ref={ref} className="link-dialog" role="dialog" aria-modal="true" aria-labelledby="link-dialog-title" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function SaveStatusIndicator({ status, text }: { status: SaveStatus; text: string }) {
  return (
    <>
      <span className={`save-status ${status}`} title={text}>
        {status === 'unsaved' && <CircleIcon size={9} />}
        {status === 'saving' && <LoaderCircleIcon size={12} />}
        {status === 'saved' && <CheckIcon size={13} />}
        {status === 'error' && <CircleAlertIcon size={13} />}
      </span>
      {/* Only a failure is spoken: the other states change on every keystroke */}
      <span className="visually-hidden" role="alert">{status === 'error' ? text : ''}</span>
    </>
  );
}

export function CopyButton({ content, lang }: { content: string; lang: 'no' | 'en' }) {
  const t = i18n[lang];
  const [feedback, setFeedback] = useState(false);
  const copy = async () => {
    try {
      // Formatted for Word and mail, Markdown everywhere else
      if (typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([markdownToHtml(content)], { type: 'text/html' }),
            'text/plain': new Blob([content], { type: 'text/plain' })
          })
        ]);
      } else {
        await navigator.clipboard.writeText(content);
      }
      setFeedback(true);
      setTimeout(() => setFeedback(false), 1500);
    } catch {
      // Clipboard write refused
    }
  };
  return (
    <button className="action-btn icon-btn" onClick={copy} title={t.copyToClipboard} aria-label={t.copy}>
      {feedback ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

interface DocumentEditorProps {
  lang: 'no' | 'en';
  docId: string;
  content: string;
  // Changes when content was replaced outside the editor
  revision: number;
  placeholder: string;
  onChange: (content: string, docId: string) => void;
  onLiveChange: (content: string, docId: string) => void;
  onEnter?: () => boolean;
  viewRef: React.MutableRefObject<EditorView | null>;
  // Right side of the header
  actions: React.ReactNode;
  // Between the header and the find bar
  above?: React.ReactNode;
  // Right end of the footer
  footer?: React.ReactNode;
  // Dialogs that need the view
  children?: React.ReactNode;
}

// Toolbar, find bar, link dialog and editor for one Markdown document:
// a note in the main window, a file in a file window
export function DocumentEditor({ lang, docId, content, revision, placeholder, onChange, onLiveChange, onEnter, viewRef, actions, above, footer, children }: DocumentEditorProps) {
  const t = i18n[lang];
  const mac = isMac();
  const shortcuts = useMemo(() => getShortcutLabels(mac), [mac]);

  const [source, setSource] = useState(false);
  const [typography, setTypography] = useState<Typography>(loadTypography);
  const [showFind, setShowFind] = useState(false);
  const [findFocusTick, setFindFocusTick] = useState(0);
  const [formats, setFormats] = useState<ActiveFormats>(NO_FORMATS);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [linkRange, setLinkRange] = useState<{ from: number; to: number } | null>(null);

  const deferredContent = useDeferredValue(content);
  const counts = useMemo(() => countWordsAndChars(deferredContent), [deferredContent]);

  // A different document starts without the find bar; MarkdownEditor
  // reports the new document's toolbar state
  useEffect(() => {
    setShowFind(false);
  }, [docId]);

  const closeLinkDialog = useCallback(() => {
    setShowLinkDialog(false);
    setLinkUrl('');
    setLinkText('');
    setLinkRange(null);
    viewRef.current?.focus();
  }, [viewRef]);

  // Find and Escape work wherever focus is; formatting shortcuts live in
  // the editor. e.code, never e.key (layout-independent)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // The link dialog is this component's own modal
      if (e.key === 'Escape' && showLinkDialog) {
        closeLinkDialog();
        return;
      }
      // A modal dialog owns the keyboard
      if (document.querySelector('[aria-modal="true"]')) return;
      if (e.key === 'Escape') {
        if (showFind) {
          setShowFind(false);
          viewRef.current?.focus();
        }
        return;
      }
      // Ctrl+F on a Mac is CodeMirror's cursor-right
      const mod = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
      if (mod && !e.altKey && !e.shiftKey && e.code === 'KeyF') {
        e.preventDefault();
        setShowFind(true);
        setFindFocusTick(tick => tick + 1);
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mac, showLinkDialog, showFind, closeLinkDialog, viewRef]);

  // Toolbar state follows at most once per frame: set on every keystroke
  // from CodeMirror's mutation observer, the updates chain into React's
  // nested-update limit while typing fast
  const pendingUpdateRef = useRef<{ formats: ActiveFormats; canUndo: boolean; canRedo: boolean } | null>(null);
  const handleUpdate = useCallback((info: { formats: ActiveFormats; canUndo: boolean; canRedo: boolean }) => {
    const scheduled = pendingUpdateRef.current !== null;
    pendingUpdateRef.current = info;
    if (scheduled) return;
    requestAnimationFrame(() => {
      const latest = pendingUpdateRef.current;
      pendingUpdateRef.current = null;
      if (!latest) return;
      setFormats(prev => (Object.keys(prev) as (keyof ActiveFormats)[]).every(k => prev[k] === latest.formats[k]) ? prev : latest.formats);
      setHistory(prev => prev.canUndo === latest.canUndo && prev.canRedo === latest.canRedo ? prev : { canUndo: latest.canUndo, canRedo: latest.canRedo });
    });
  }, []);

  const openLinkDialog = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    setLinkRange({ from, to });
    setLinkText(view.state.sliceDoc(from, to));
    setLinkUrl('');
    setLinkError(false);
    setShowLinkDialog(true);
  }, [viewRef]);

  const toggleSource = useCallback(() => setSource(on => !on), []);
  const noEnter = useCallback(() => false, []);

  const changeTypography = useCallback((next: Typography) => {
    setTypography(next);
    saveTypography(next);
  }, []);

  // Glyph widths change with the font, size and Recursive's mono axis;
  // CodeMirror measures again once the font is in and the glide is over
  useEffect(() => {
    let cancelled = false;
    const remeasure = () => { if (!cancelled) viewRef.current?.requestMeasure(); };
    document.fonts.load(`${SIZES[typography.size]}px ${FONTS[typography.font].stack.split(',')[0]}`).then(remeasure, remeasure);
    const timer = setTimeout(remeasure, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [typography, source, viewRef]);

  const confirmLink = () => {
    const view = viewRef.current;
    const url = /^[a-z][a-z0-9+.-]*:/i.test(linkUrl) ? linkUrl : `https://${linkUrl}`;
    if (!isSafeUrl(url)) {
      setLinkError(true);
      return;
    }
    if (view && linkRange) insertLink(view, url, linkText, linkRange);
    closeLinkDialog();
  };

  const run = (command: (view: EditorView) => boolean) => {
    const view = viewRef.current;
    if (!view) return;
    command(view);
    view.focus();
  };
  const inline = (style: InlineStyle) => run(view => toggleInline(view, style));
  const lines = (style: LineStyle) => run(view => toggleLines(view, style));

  // Arrow keys move focus within a toolbar (WAI-ARIA toolbar pattern)
  const handleToolbarKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('.format-group > button:not(:disabled), .style-menu > button, .type-menu > button'));
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (index === -1) return;
    e.preventDefault();
    const next = e.key === 'ArrowRight' ? index + 1 : index + items.length - 1;
    items[next % items.length].focus();
  };

  // Buttons keep the caret in the editor
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  const formatButton = (label: string, shortcut: string | null, active: boolean | null, onClick: () => void, Icon: (props: { size?: number }) => React.ReactElement) => (
    <button
      className={`format-btn ${active ? 'active' : ''}`}
      onMouseDown={keepFocus}
      onClick={onClick}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={active ?? undefined}
    >
      <Icon />
    </button>
  );

  return (
    <div className="editor-panel">
      <div className="editor-header">
        <div className="formatting-toolbar" role="toolbar" aria-label={t.formatting} onKeyDown={handleToolbarKeyDown}>
          <div className="format-group">
            <button
              className="action-btn icon-btn"
              onClick={() => run(undo)}
              disabled={!history.canUndo}
              title={`${t.undo} (${shortcuts.undo})`}
              aria-label={t.undo}
            >
              <UndoIcon />
            </button>
            <button
              className="action-btn icon-btn"
              onClick={() => run(redo)}
              disabled={!history.canRedo}
              title={`${t.redo} (${shortcuts.redo})`}
              aria-label={t.redo}
            >
              <RedoIcon />
            </button>
          </div>
          <div className="format-group">
            <StyleMenu
              label={t.textStyle}
              value={formats.heading <= 3 ? formats.heading : null}
              otherLabel={`H${formats.heading}`}
              onSelect={(level) => run(view => setHeading(view, level))}
              options={[
                { label: t.bodyText, shortcut: shortcuts.bodyText },
                { label: t.heading1, shortcut: shortcuts.heading1 },
                { label: t.heading2, shortcut: shortcuts.heading2 },
                { label: t.heading3, shortcut: shortcuts.heading3 }
              ]}
            />
            <TypographyMenu t={t} value={typography} onChange={changeTypography} />
          </div>
          <div className="format-group">
            {formatButton(t.boldShortcut, shortcuts.bold, formats.bold, () => inline('bold'), BoldIcon)}
            {formatButton(t.italicShortcut, shortcuts.italic, formats.italic, () => inline('italic'), ItalicIcon)}
            {formatButton(t.inlineCodeShortcut, shortcuts.inlineCode, formats.code, () => inline('code'), CodeIcon)}
          </div>
          <div className="format-group">
            {formatButton(t.linkShortcut, shortcuts.link, null, openLinkDialog, LinkIcon)}
          </div>
          <div className="format-group">
            {formatButton(t.bulletListShortcut, shortcuts.bulletList, formats.list === 'bullet', () => lines('bullet'), BulletListIcon)}
            {formatButton(t.numberedListShortcut, shortcuts.numberedList, formats.list === 'ordered', () => lines('ordered'), NumberedListIcon)}
            {formatButton(t.taskListShortcut, shortcuts.taskList, formats.list === 'task', () => lines('task'), TaskListIcon)}
            {formatButton(t.quoteShortcut, shortcuts.quote, formats.list === 'quote', () => lines('quote'), QuoteIcon)}
            {formatButton(t.codeBlockShortcut, shortcuts.codeBlock, null, () => run(toggleCodeBlock), CodeBlockIcon)}
          </div>
          <div className="format-group">
            {formatButton(t.showMarkdown, shortcuts.markdownLens, source, toggleSource, MarkdownLabel)}
          </div>
        </div>
        <div className="header-actions">
          {actions}
        </div>
      </div>

      {showLinkDialog && (
        <LinkDialog onClose={closeLinkDialog}>
            <div className="link-dialog-header">
              <h3 id="link-dialog-title">{t.insertLink}</h3>
              <button className="link-dialog-close" onClick={closeLinkDialog} aria-label={t.close}>
                <CloseIcon size={16} />
              </button>
            </div>
            <div className="link-dialog-body">
              <label>
                <span>{t.linkUrl}</span>
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => { setLinkUrl(e.target.value); setLinkError(false); }}
                  aria-invalid={linkError}
                  aria-describedby={linkError ? 'link-error' : undefined}
                  onKeyDown={(e) => { if (e.key === 'Enter' && linkUrl) { e.preventDefault(); confirmLink(); } }}
                  placeholder="https://..."
                  autoFocus
                />
              </label>
              <label>
                <span>{t.linkText}</span>
                <input
                  type="text"
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && linkUrl) { e.preventDefault(); confirmLink(); } }}
                  placeholder={t.optional}
                />
              </label>
              {linkError && <p id="link-error" className="dialog-error">{t.linkUnsafe}</p>}
            </div>
            <div className="link-dialog-actions">
              <button className="action-btn" onClick={closeLinkDialog}>
                {t.cancel}
              </button>
              <button className="action-btn save-btn" onClick={confirmLink} disabled={!linkUrl}>
                {t.insert}
              </button>
            </div>
        </LinkDialog>
      )}

      {above}

      {showFind && (
        <FindReplaceBar
          lang={lang}
          content={content}
          viewRef={viewRef}
          onClose={() => { setShowFind(false); viewRef.current?.focus(); }}
          focusTick={findFocusTick}
        />
      )}

      {children}

      <div
        className="editor-container"
        data-lens={source ? 'source' : 'formatted'}
        style={{
          '--editor-font': FONTS[typography.font].stack,
          '--editor-size': `${SIZES[typography.size]}px`,
          '--editor-line': SPACINGS[typography.spacing]
        } as React.CSSProperties}
      >
        <MarkdownEditor
          noteId={docId}
          content={content}
          revision={revision}
          source={source}
          placeholder={placeholder}
          lang={lang}
          onChange={onChange}
          onLiveChange={onLiveChange}
          onEnter={onEnter ?? noEnter}
          onUpdate={handleUpdate}
          onLinkRequest={openLinkDialog}
          onToggleSource={toggleSource}
          viewRef={viewRef}
        />
      </div>

      <div className="editor-footer">
        <span className="word-count">{counts.words} {t.words}</span>
        <span className="char-count">{counts.chars} {t.characters}</span>
        {footer}
      </div>
    </div>
  );
}
