import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { EditorView } from '@codemirror/view';
import { useApp } from '@/contexts';
import { i18n } from '@/utils/i18n';
import { isMac, formatDate, isUnnamed } from '@/utils/helpers';
import { titleFromMarkdown } from '@/utils/markdown';
import { downloadNote, type ExportFormat } from '@/utils/fileSystem';
import { getShortcutLabels } from '@/utils/shortcuts';
import { recordVersion } from '@/utils/storage';
import { usePopover } from '@/hooks';
import { DocumentEditor, SaveStatusIndicator, CopyButton } from './DocumentEditor';
import { HistoryDialog } from './HistoryDialog';
import { UpdateButton } from './UpdateButton';
import { CloseIcon, HistoryIcon, DownloadIcon, DeleteIcon } from './Icons';

export function Editor() {
  const { state, getSelectedNote, updateNote, deleteNote, toggleNoteTag, saveStatus, trackLiveEdit } = useApp();
  const t = i18n[state.lang];
  const note = getSelectedNote();
  const mac = isMac();
  const shortcuts = useMemo(() => getShortcutLabels(mac), [mac]);

  const [showVersions, setShowVersions] = useState(false);
  const exportMenu = usePopover();

  const viewRef = useRef<EditorView | null>(null);
  const noteRef = useRef(note);
  noteRef.current = note;
  // Notes named in this session: during fast typing React may not have
  // rendered the new title before the next Enter
  const namedRef = useRef(new Set<string>());

  useEffect(() => {
    setShowVersions(false);
  }, [note?.id]);

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
    if (namedRef.current.has(current.id) || !isUnnamed(current.title)) return false;
    const doc = view.state.doc.toString();
    // Enter inside the line splits it, as everywhere else
    const { empty, head } = view.state.selection.main;
    if (!doc.trim() || doc.includes('\n') || !empty || head !== doc.length) return false;
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

  const handleExport = (format: ExportFormat) => {
    downloadNote(note, format);
    exportMenu.setOpen(false);
  };

  const saveStatusText = { saving: t.saving, unsaved: t.unsaved, error: t.saveError, saved: t.saved }[saveStatus];

  const actions = (
    <>
      <div className="format-group">
        <UpdateButton />
        <SaveStatusIndicator status={saveStatus} text={saveStatusText} />
        <button className="action-btn icon-btn" onClick={() => setShowVersions(true)} title={t.history} aria-label={t.history}>
          <HistoryIcon />
        </button>
      </div>
      <div className="format-group">
        <CopyButton content={note.content} lang={state.lang} />
        <div className="export-menu-container" {...exportMenu.rootProps}>
          <button
            ref={exportMenu.triggerRef}
            className="action-btn icon-btn"
            onClick={() => exportMenu.setOpen(!exportMenu.open)}
            aria-expanded={exportMenu.open}
            title={t.exportNote}
            aria-label={t.exportNote}
          >
            <DownloadIcon size={14} />
          </button>
          {exportMenu.open && (
            <div className="export-menu">
              <button onClick={() => handleExport('markdown')}>{t.exportAsMarkdown}</button>
              <button onClick={() => handleExport('html')}>{t.exportAsHtml}</button>
            </div>
          )}
        </div>
      </div>
      <div className="format-group">
        <button className="action-btn icon-btn" onClick={() => deleteNote(note.id)} title={t.delete} aria-label={t.delete}>
          <DeleteIcon size={14} />
        </button>
      </div>
    </>
  );

  const tags = note.tags.length > 0 && (
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
  );

  return (
    <DocumentEditor
      lang={state.lang}
      docId={note.id}
      content={note.content}
      revision={state.mergeRevision}
      placeholder={isUnnamed(note.title) ? t.editorPlaceholder : t.writeHere}
      onChange={handleChange}
      onLiveChange={trackLiveEdit}
      onEnter={captureNoteName}
      viewRef={viewRef}
      actions={actions}
      above={tags}
      footer={<span className="note-modified">{t.modified}: {formatDate(note.updatedAt, state.lang)}</span>}
    >
      {showVersions && viewRef.current && (
        <HistoryDialog
          noteId={note.id}
          current={viewRef.current.state.doc.toString()}
          onRestore={restoreVersion}
          onClose={closeVersions}
        />
      )}
    </DocumentEditor>
  );
}
