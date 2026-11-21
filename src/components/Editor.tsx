import { useState, useRef, useEffect, useCallback, useDeferredValue, useMemo } from 'react';
import type { EditorView } from '@codemirror/view';
import { undo, redo } from '@codemirror/commands';
import { useApp } from '@/contexts';
import { i18n } from '@/utils/i18n';
import { isMac, formatDate } from '@/utils/helpers';
import { markdownToHtml, markdownToPlainText, titleFromMarkdown } from '@/utils/markdown';
import { downloadNote, type ExportFormat } from '@/utils/fileSystem';
import { isSafeUrl } from '@/utils/sanitize';
import { getShortcutLabels } from '@/utils/shortcuts';
import { toggleInline, toggleLines, toggleCodeBlock, setHeading, insertLink, type ActiveFormats, type InlineStyle, type LineStyle } from '@/editor/commands';
import { FindReplaceBar } from './FindReplaceBar';
import { MarkdownEditor } from './MarkdownEditor';
import { HistoryDialog } from './HistoryDialog';
import { StyleMenu } from './StyleMenu';
import { TypographyMenu } from './TypographyMenu';
import { FONTS, SIZES, SPACINGS, loadTypography, saveTypography, type Typography } from '@/utils/typography';
import { recordVersion } from '@/utils/storage';
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
  CircleAlertIcon,
  HistoryIcon,
  PlusIcon,
  DownloadIcon,
  TagIcon,
  DeleteIcon
} from './Icons';

const DEFAULT_TITLES = [i18n.no.untitled, i18n.en.untitled, 'Notat', 'Note'];

const NO_FORMATS: ActiveFormats = { bold: false, italic: false, code: false, heading: 0, list: null };

function countWordsAndChars(content: string): { words: number; chars: number } {
  const text = markdownToPlainText(content);
  return { words: text.trim() === '' ? 0 : text.trim().split(/\s+/).length, chars: text.length };
}

// "MD" reads as Markdown at a glance; no icon set has a clearer mark
const MarkdownLabel = () => <span className="md-label" aria-hidden="true">MD</span>;

export function Editor() {
  const { state, getSelectedNote, updateNote, deleteNote, addTag, toggleNoteTag, saveStatus, trackLiveEdit } = useApp();
  const t = i18n[state.lang];
  const note = getSelectedNote();
  const mac = isMac();
  const shortcuts = useMemo(() => getShortcutLabels(mac), [mac]);

  const [showTagPicker, setShowTagPicker] = useState(false);
  // Bumped by the new-tag shortcut; focuses the input after the picker renders
  const [tagFocusTick, setTagFocusTick] = useState(0);
  const [newTagName, setNewTagName] = useState('');
  const [source, setSource] = useState(false);
  const [typography, setTypography] = useState<Typography>(loadTypography);
  const [showFind, setShowFind] = useState(false);
  const [findFocusTick, setFindFocusTick] = useState(0);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [formats, setFormats] = useState<ActiveFormats>(NO_FORMATS);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [showVersions, setShowVersions] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [linkRange, setLinkRange] = useState<{ from: number; to: number } | null>(null);

  const viewRef = useRef<EditorView | null>(null);
  const tagPickerRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef(note);
  noteRef.current = note;
  // Notes named in this session: during fast typing React may not have
  // rendered the new title before the next Enter
  const namedRef = useRef(new Set<string>());

  const deferredContent = useDeferredValue(note?.content ?? '');
  const counts = useMemo(() => countWordsAndChars(deferredContent), [deferredContent]);

  useEffect(() => {
    if (tagFocusTick > 0) {
      (document.querySelector('.new-tag-input') as HTMLInputElement | null)?.focus();
    }
  }, [tagFocusTick]);

  // A different note starts without the find bar and stale toolbar state
  useEffect(() => {
    setShowFind(false);
    setShowVersions(false);
    setFormats(NO_FORMATS);
    setHistory({ canUndo: false, canRedo: false });
  }, [note?.id]);

  // Close tag picker and export menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tagPickerRef.current && !tagPickerRef.current.contains(e.target as Node)) {
        setShowTagPicker(false);
      }
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Find, new tag and Escape work wherever focus is; formatting shortcuts
  // live in the editor. e.code, never e.key (layout-independent)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // The link dialog is this component's own modal
      if (e.key === 'Escape' && showLinkDialog) {
        setShowLinkDialog(false);
        viewRef.current?.focus();
        return;
      }
      // A modal dialog owns the keyboard
      if (document.querySelector('[aria-modal="true"]')) return;
      if (e.key === 'Escape') {
        if (showTagPicker) {
          setShowTagPicker(false);
        } else if (showExportMenu) {
          setShowExportMenu(false);
        } else if (showFind) {
          setShowFind(false);
          viewRef.current?.focus();
        }
        return;
      }
      if (!noteRef.current) return;
      const isCmd = e.metaKey || e.ctrlKey;
      if (isCmd && !e.altKey && !e.shiftKey && e.code === 'KeyF') {
        e.preventDefault();
        setShowFind(true);
        setFindFocusTick(tick => tick + 1);
        return;
      }
      const newTagCombo = mac
        ? (e.altKey && !e.metaKey && !e.shiftKey && !e.ctrlKey && e.code === 'KeyT')
        : (e.ctrlKey && e.shiftKey && !e.altKey && e.code === 'Digit4');
      if (newTagCombo) {
        e.preventDefault();
        setShowTagPicker(true);
        setTagFocusTick(tick => tick + 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mac, showLinkDialog, showTagPicker, showExportMenu, showFind]);

  const closeVersions = useCallback(() => {
    setShowVersions(false);
    viewRef.current?.focus();
  }, []);

  // Through the view, so Cmd/Ctrl+Z takes the restore back. The text it
  // replaces becomes a version first, whatever the interval says
  const restoreVersion = useCallback(async (content: string) => {
    const view = viewRef.current;
    const current = noteRef.current;
    if (!view || !current) return;
    await recordVersion(current.id, view.state.doc.toString(), current.updatedAt, true);
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } });
    closeVersions();
  }, [closeVersions]);

  // Naming flow: in an unnamed note, the first line plus Enter becomes the
  // name and leaves the content, so exports hold only the content
  const captureNoteName = useCallback((): boolean => {
    const current = noteRef.current;
    const view = viewRef.current;
    if (!current || !view) return false;
    if (namedRef.current.has(current.id) || (current.title && !DEFAULT_TITLES.includes(current.title))) return false;
    const doc = view.state.doc.toString();
    if (!doc.trim() || doc.includes('\n')) return false;
    const name = titleFromMarkdown(doc);
    if (!name) return false;
    namedRef.current.add(current.id);
    updateNote(current.id, { title: name });
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '' } });
    return true;
  }, [updateNote]);

  const handleChange = useCallback((content: string, noteId: string) => {
    updateNote(noteId, { content });
  }, [updateNote]);

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
    setShowLinkDialog(true);
  }, []);

  const toggleSource = useCallback(() => setSource(on => !on), []);

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
  }, [typography, source]);

  const confirmLink = () => {
    const view = viewRef.current;
    const url = /^[a-z][a-z0-9+.-]*:/i.test(linkUrl) ? linkUrl : `https://${linkUrl}`;
    if (view && linkRange && linkUrl && isSafeUrl(url)) {
      insertLink(view, url, linkText, linkRange);
    }
    setShowLinkDialog(false);
    setLinkUrl('');
    setLinkText('');
    setLinkRange(null);
  };

  const run = (command: (view: EditorView) => boolean) => {
    const view = viewRef.current;
    if (!view) return;
    command(view);
    view.focus();
  };
  const inline = (style: InlineStyle) => run(view => toggleInline(view, style));
  const lines = (style: LineStyle) => run(view => toggleLines(view, style));

  const handleCopy = async () => {
    if (!note) return;
    try {
      // Formatted for Word and mail, Markdown everywhere else
      if (typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([markdownToHtml(note.content)], { type: 'text/html' }),
            'text/plain': new Blob([note.content], { type: 'text/plain' })
          })
        ]);
      } else {
        await navigator.clipboard.writeText(note.content);
      }
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1500);
    } catch {
      // Clipboard write refused
    }
  };

  // Arrow keys move focus within a toolbar (WAI-ARIA toolbar pattern)
  const handleToolbarKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('.format-group > button, .style-menu > button, .type-menu > button'));
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (index === -1) return;
    e.preventDefault();
    const next = e.key === 'ArrowRight' ? index + 1 : index + items.length - 1;
    items[next % items.length].focus();
  };

  if (!note) {
    return (
      <div className="editor-panel">
        <div className="no-selection">
          <span className="empty-state-hint">
            {t.click} <span className="hint-badge">+</span> {t.orPress} <span className="hint-badge">{shortcuts.newNote}</span>
          </span>
        </div>
      </div>
    );
  }

  const handleAddTag = () => {
    if (newTagName.trim()) {
      addTag(newTagName.trim());
      setNewTagName('');
    }
  };

  const handleExport = (format: ExportFormat) => {
    downloadNote(note, format);
    setShowExportMenu(false);
  };

  const saveStatusText = { saving: t.saving, unsaved: t.unsaved, error: t.saveError, saved: t.saved }[saveStatus];

  // Buttons keep the caret in the editor
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  const isUnnamed = !note.title || DEFAULT_TITLES.includes(note.title);
  const placeholderText = isUnnamed ? t.editorPlaceholder : t.writeHere;

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
            <StyleMenu
              label={t.textStyle}
              value={Math.min(formats.heading, 3)}
              onSelect={(level) => run(view => setHeading(view, level))}
              options={[
                { label: t.bodyText, shortcut: shortcuts.bodyText },
                { label: t.heading1, shortcut: shortcuts.heading1 },
                { label: t.heading2, shortcut: shortcuts.heading2 },
                { label: t.heading3, shortcut: shortcuts.heading3 }
              ]}
            />
          </div>
          <div className="format-group">
            {formatButton(t.boldShortcut, shortcuts.bold, formats.bold, () => inline('bold'), BoldIcon)}
            {formatButton(t.italicShortcut, shortcuts.italic, formats.italic, () => inline('italic'), ItalicIcon)}
            {formatButton(t.inlineCodeShortcut, shortcuts.inlineCode, formats.code, () => inline('code'), CodeIcon)}
          </div>
          <div className="format-group">
            {formatButton(t.bulletListShortcut, shortcuts.bulletList, formats.list === 'bullet', () => lines('bullet'), BulletListIcon)}
            {formatButton(t.numberedListShortcut, shortcuts.numberedList, formats.list === 'ordered', () => lines('ordered'), NumberedListIcon)}
            {formatButton(t.taskListShortcut, shortcuts.taskList, formats.list === 'task', () => lines('task'), TaskListIcon)}
            {formatButton(t.quoteShortcut, shortcuts.quote, formats.list === 'quote', () => lines('quote'), QuoteIcon)}
            {formatButton(t.codeBlockShortcut, shortcuts.codeBlock, null, () => run(toggleCodeBlock), CodeBlockIcon)}
          </div>
          <div className="format-group">
            {formatButton(t.linkShortcut, shortcuts.link, null, openLinkDialog, LinkIcon)}
          </div>
          <div className="format-group">
            {formatButton(t.showMarkdown, shortcuts.markdownLens, source, toggleSource, MarkdownLabel)}
            <TypographyMenu t={t} value={typography} onChange={changeTypography} />
          </div>
        </div>
        <div className="header-actions">
          <span className={`save-status ${saveStatus}`} title={saveStatusText} aria-live="polite">
            {saveStatus === 'unsaved' && <CircleIcon size={9} />}
            {saveStatus === 'saving' && <LoaderCircleIcon size={12} />}
            {saveStatus === 'saved' && <CheckIcon size={13} />}
            {saveStatus === 'error' && <CircleAlertIcon size={13} />}
          </span>
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
          <button className="action-btn icon-btn" onClick={() => setShowVersions(true)} title={t.history} aria-label={t.history}>
            <HistoryIcon />
          </button>
          <button className="action-btn icon-btn" onClick={handleCopy} title={t.copyToClipboard} aria-label={t.copy}>
            {copyFeedback ? <CheckIcon /> : <CopyIcon />}
          </button>
          <div className="export-menu-container" ref={exportMenuRef}>
            <button
              className="action-btn icon-btn"
              onClick={() => setShowExportMenu(!showExportMenu)}
              aria-expanded={showExportMenu}
              title={t.save}
              aria-label={t.save}
            >
              <DownloadIcon size={14} />
            </button>
            {showExportMenu && (
              <div className="export-menu">
                <button onClick={() => handleExport('markdown')}>{t.exportAsMarkdown}</button>
                <button onClick={() => handleExport('html')}>{t.exportAsHtml}</button>
              </div>
            )}
          </div>
          <div className="export-menu-container" ref={tagPickerRef}>
            <button
              className="action-btn icon-btn"
              onClick={() => setShowTagPicker(!showTagPicker)}
              aria-expanded={showTagPicker}
              title={t.assignTags}
              aria-label={t.assignTags}
            >
              <TagIcon size={14} />
            </button>
            {showTagPicker && (
              <div className="tag-picker show">
                {state.tags.length > 0 && (
                  <div className="tag-picker-list">
                    {[...state.tags].sort((a, b) => a.name.localeCompare(b.name, state.lang)).map(tag => (
                      <button key={tag.id} className="tag-picker-item" onClick={() => toggleNoteTag(note.id, tag.id)} aria-pressed={note.tags.includes(tag.id)}>
                        <span>{tag.name}</span>
                        {note.tags.includes(tag.id) && <span className="check-mark"><CheckIcon size={14} /></span>}
                      </button>
                    ))}
                  </div>
                )}
                <div className="tag-add-row">
                  <input
                    type="text"
                    className="new-tag-input"
                    placeholder={t.newTagPlaceholder}
                    aria-label={t.newTagPlaceholder}
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddTag(); }}
                    dir="ltr"
                    autoFocus={state.tags.length === 0}
                  />
                  <button className="row-icon-btn" onClick={handleAddTag} disabled={!newTagName.trim()} title={t.addTag} aria-label={t.addTag}>
                    <PlusIcon size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
          <button className="action-btn icon-btn" onClick={() => deleteNote(note.id)} title={t.delete} aria-label={t.delete}>
            <DeleteIcon size={14} />
          </button>
        </div>
      </div>

      {showLinkDialog && (
        <div className="link-dialog-overlay">
          <div className="link-dialog" role="dialog" aria-modal="true" aria-labelledby="link-dialog-title">
            <div className="link-dialog-header">
              <h3 id="link-dialog-title">{t.insertLink}</h3>
              <button className="link-dialog-close" onClick={() => setShowLinkDialog(false)} aria-label={t.close}>
                <CloseIcon size={16} />
              </button>
            </div>
            <div className="link-dialog-body">
              <label>
                <span>{t.linkUrl}</span>
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && linkUrl) confirmLink(); }}
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
                  onKeyDown={(e) => { if (e.key === 'Enter' && linkUrl) confirmLink(); }}
                  placeholder={t.optional}
                />
              </label>
            </div>
            <div className="link-dialog-actions">
              <button className="action-btn" onClick={() => setShowLinkDialog(false)}>
                {t.cancel}
              </button>
              <button className="action-btn save-btn" onClick={confirmLink} disabled={!linkUrl}>
                {t.insert}
              </button>
            </div>
          </div>
        </div>
      )}


      {note.tags.length > 0 && (
        <div className="current-tags">
          {note.tags
            .map(tagId => state.tags.find(tag => tag.id === tagId))
            .filter((tag): tag is NonNullable<typeof tag> => tag !== undefined)
            .sort((a, b) => a.name.localeCompare(b.name, state.lang))
            .map(tag => (
              <button
                key={tag.id}
                className="current-tag"
                onClick={() => toggleNoteTag(note.id, tag.id)}
                title={t.removeTag}
                aria-label={`${t.removeTag}: ${tag.name}`}
              >
                {tag.name}
                <CloseIcon size={10} />
              </button>
            ))}
        </div>
      )}

      {showFind && (
        <FindReplaceBar
          content={note.content}
          viewRef={viewRef}
          onClose={() => { setShowFind(false); viewRef.current?.focus(); }}
          focusTick={findFocusTick}
        />
      )}

      {showVersions && viewRef.current && (
        <HistoryDialog
          noteId={note.id}
          current={viewRef.current.state.doc.toString()}
          onRestore={restoreVersion}
          onClose={closeVersions}
        />
      )}

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
          noteId={note.id}
          content={note.content}
          revision={state.mergeRevision}
          source={source}
          placeholder={placeholderText}
          lang={state.lang}
          onChange={handleChange}
          onLiveChange={trackLiveEdit}
          onEnter={captureNoteName}
          onUpdate={handleUpdate}
          onLinkRequest={openLinkDialog}
          onToggleSource={toggleSource}
          viewRef={viewRef}
        />
      </div>

      <div className="editor-footer">
        <span className="word-count">{counts.words} {t.words}</span>
        <span className="char-count">{counts.chars} {t.characters}</span>
        <span className="note-modified">{t.modified}: {formatDate(note.updatedAt, state.lang)}</span>
      </div>
    </div>
  );
}
