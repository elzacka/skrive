import { useState, useRef, useEffect, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { useApp } from '@/contexts';
import { i18n } from '@/utils/i18n';
import { useUndoRedo } from '@/hooks';
import { isMac } from '@/utils';
import type { NoteFormat } from '@/types';

// Configure DOMPurify to allow safe tags only
const DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'ul', 'ol', 'li',
                 'strong', 'b', 'em', 'i', 'u', 'strike', 's', 'del', 'code', 'pre',
                 'blockquote', 'a', 'span', 'div'],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'dir'],
};

// Sanitize HTML content
function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, DOMPURIFY_CONFIG) as string;
}

// Check if URL is safe
function isSafeUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  return !trimmed.startsWith('javascript:') &&
         !trimmed.startsWith('data:') &&
         !trimmed.startsWith('vbscript:');
}

// Simple markdown to HTML converter
function markdownToHtml(md: string): string {
  let html = md
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/___(.+?)___/g, '<strong><em>$1</em></strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, (_, text, url) => {
      if (isSafeUrl(url)) {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;
      }
      return text;
    })
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^[\-\*] (.+)$/gm, '<li>$1</li>')
    .replace(/^---$/gm, '<hr>')
    .replace(/\n/g, '<br>');

  html = html.replace(/(<li>.*?<\/li>)(\s*<br>\s*<li>.*?<\/li>)+/g, (match) => {
    return '<ul>' + match.replace(/<br>/g, '') + '</ul>';
  });

  return sanitizeHtml(html);
}

// Create default XML template
function getDefaultXmlTemplate(title: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<note>
  <title>${escapeXml(title)}</title>
  <content></content>
</note>`;
}

// Escape XML special characters
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Icons
function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14">
      <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" fill="currentColor"/>
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14">
      <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z" fill="currentColor"/>
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14">
      <path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z" fill="currentColor"/>
    </svg>
  );
}

function PreviewIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14">
      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" fill="currentColor"/>
    </svg>
  );
}

function BulletListIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14">
      <path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z" fill="currentColor"/>
    </svg>
  );
}

function NumberedListIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14">
      <path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z" fill="currentColor"/>
    </svg>
  );
}

// Rich text editor component - separate to avoid re-render issues
function RichTextEditor({
  content,
  onContentChange,
  editorRef,
  placeholder
}: {
  content: string;
  onContentChange: (content: string) => void;
  editorRef: React.RefObject<HTMLDivElement | null>;
  placeholder: string;
}) {
  const initialContentRef = useRef<string>(content);
  const isInitializedRef = useRef(false);

  // Only set innerHTML on mount or when note changes (content reference changes significantly)
  useEffect(() => {
    if (editorRef.current) {
      // Only update if this is initial load or content was reset externally
      if (!isInitializedRef.current || initialContentRef.current !== content) {
        editorRef.current.innerHTML = sanitizeHtml(content);
        initialContentRef.current = content;
        isInitializedRef.current = true;
      }
    }
  }, [content, editorRef]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      const newContent = editorRef.current.innerHTML;
      initialContentRef.current = newContent;
      onContentChange(newContent);
    }
  }, [editorRef, onContentChange]);

  return (
    <div
      ref={editorRef}
      className="editor richtext"
      contentEditable
      dir="ltr"
      onInput={handleInput}
      aria-label={placeholder}
      suppressContentEditableWarning
    />
  );
}

export function Editor() {
  const { state, getSelectedNote, updateNote, deleteNote, saveCurrentNote, addTag, toggleNoteTag } = useApp();
  const t = i18n[state.lang];
  const note = getSelectedNote();
  const mac = isMac();

  const [showTagPicker, setShowTagPicker] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [currentBlockStyle, setCurrentBlockStyle] = useState('p');

  const tagPickerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const richtextRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedContentRef = useRef<string>('');
  const lastNoteIdRef = useRef<string | null>(null);

  const { pushState, undo, redo, canUndo, canRedo, reset } = useUndoRedo(note?.content || '');

  // Reset state when note changes
  useEffect(() => {
    if (note && note.id !== lastNoteIdRef.current) {
      lastNoteIdRef.current = note.id;
      reset(note.content);
      lastSavedContentRef.current = note.content;
      setSaveStatus('saved');
      setCurrentBlockStyle('p');

      // Focus editor after a short delay to allow DOM to update
      requestAnimationFrame(() => {
        if (note.format === 'richtext') {
          richtextRef.current?.focus();
        } else {
          textareaRef.current?.focus();
        }
      });
    }
  }, [note?.id, note?.content, note?.format, reset]);

  // Track unsaved changes
  useEffect(() => {
    if (note && note.content !== lastSavedContentRef.current) {
      setSaveStatus('unsaved');

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        lastSavedContentRef.current = note.content;
        setSaveStatus('saved');
      }, 2000);
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [note?.content]);

  // Close tag picker on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tagPickerRef.current && !tagPickerRef.current.contains(e.target as Node)) {
        setShowTagPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleUndo = useCallback(() => {
    const undoState = undo();
    if (undoState && note) {
      updateNote(note.id, { content: undoState.content });
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = undoState.cursorPosition;
          textareaRef.current.selectionEnd = undoState.cursorPosition;
        }
      });
    }
  }, [undo, note, updateNote]);

  const handleRedo = useCallback(() => {
    const redoState = redo();
    if (redoState && note) {
      updateNote(note.id, { content: redoState.content });
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = redoState.cursorPosition;
          textareaRef.current.selectionEnd = redoState.cursorPosition;
        }
      });
    }
  }, [redo, note, updateNote]);

  const handleCopyToClipboard = useCallback(async () => {
    if (!note) return;

    try {
      await navigator.clipboard.writeText(note.content);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1500);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [note]);

  // Format command for rich text - uses Selection API properly
  const applyFormat = useCallback((command: string, value?: string) => {
    const editor = richtextRef.current;
    if (!editor) return;

    // Ensure editor has focus
    editor.focus();

    // Execute the command
    document.execCommand(command, false, value);

    // Update block style selector if formatBlock was used
    if (command === 'formatBlock' && value) {
      setCurrentBlockStyle(value);
    }
  }, []);

  const handleRichtextChange = useCallback((content: string) => {
    if (note) {
      updateNote(note.id, { content });
      pushState(content, 0);
    }
  }, [note, updateNote, pushState]);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          handleUndo();
        } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
          e.preventDefault();
          handleRedo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  if (!note) {
    return (
      <div className="editor-panel">
        <div className="no-selection"></div>
      </div>
    );
  }

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateNote(note.id, { title: e.target.value });
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const content = e.target.value;
    const cursorPosition = e.target.selectionStart;
    updateNote(note.id, { content });
    pushState(content, cursorPosition);
  };

  const handleFormatChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newFormat = e.target.value as NoteFormat;
    const oldFormat = note.format;
    let newContent = note.content;

    if (newFormat === 'xml' && oldFormat !== 'xml') {
      if (!note.content.trim().startsWith('<?xml')) {
        newContent = getDefaultXmlTemplate(note.title);
      }
    } else if (newFormat === 'plaintext' && oldFormat === 'richtext') {
      newContent = note.content
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .trim();
    } else if (newFormat === 'plaintext' && oldFormat === 'xml') {
      const contentMatch = note.content.match(/<content>([\s\S]*?)<\/content>/);
      newContent = contentMatch ? contentMatch[1].trim() : note.content;
    }

    updateNote(note.id, { format: newFormat, content: newContent });
    setShowPreview(newFormat === 'markdown' || newFormat === 'xml' ? showPreview : false);

    requestAnimationFrame(() => {
      if (newFormat === 'richtext') {
        richtextRef.current?.focus();
      } else {
        textareaRef.current?.focus();
      }
    });
  };

  const handleBlockStyleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    applyFormat('formatBlock', value);
  };

  const handleAddTag = () => {
    if (newTagName.trim()) {
      addTag(newTagName.trim());
      setNewTagName('');
    }
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleAddTag();
    }
  };

  const handleDelete = () => {
    if (confirm(state.lang === 'no' ? 'Slett dette notatet?' : 'Delete this note?')) {
      deleteNote(note.id);
    }
  };

  const handleSave = async () => {
    setSaveStatus('saving');
    await saveCurrentNote();
    lastSavedContentRef.current = note.content;
    setSaveStatus('saved');
  };

  const getSaveStatusText = () => {
    switch (saveStatus) {
      case 'saving': return state.lang === 'no' ? 'Lagrer...' : 'Saving...';
      case 'unsaved': return state.lang === 'no' ? 'Ulagret' : 'Unsaved';
      default: return state.lang === 'no' ? 'Lagret' : 'Saved';
    }
  };

  // Prevent default on mousedown to keep focus in editor
  const preventFocusLoss = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  return (
    <div className="editor-panel">
      <div className="editor-header">
        <input
          type="text"
          className="title-input"
          placeholder={t.titlePlaceholder}
          value={note.title}
          onChange={handleTitleChange}
          aria-label={t.titlePlaceholder}
          dir="ltr"
        />
        <div className="header-actions">
          <span className={`save-status ${saveStatus}`} title={getSaveStatusText()}>
            {saveStatus === 'unsaved' && '●'}
            {saveStatus === 'saving' && '○'}
            {saveStatus === 'saved' && '✓'}
          </span>
          <button
            className="action-btn icon-btn"
            onClick={handleUndo}
            disabled={!canUndo}
            title={`${state.lang === 'no' ? 'Angre' : 'Undo'} (${mac ? '⌘Z' : 'Ctrl+Z'})`}
            aria-label={state.lang === 'no' ? 'Angre' : 'Undo'}
          >
            <UndoIcon />
          </button>
          <button
            className="action-btn icon-btn"
            onClick={handleRedo}
            disabled={!canRedo}
            title={`${state.lang === 'no' ? 'Gjør om' : 'Redo'} (${mac ? '⌘⇧Z' : 'Ctrl+Y'})`}
            aria-label={state.lang === 'no' ? 'Gjør om' : 'Redo'}
          >
            <RedoIcon />
          </button>
          <button
            className="action-btn icon-btn"
            onClick={handleCopyToClipboard}
            title={state.lang === 'no' ? 'Kopier til utklippstavle' : 'Copy to clipboard'}
            aria-label={state.lang === 'no' ? 'Kopier' : 'Copy'}
          >
            {copyFeedback ? '✓' : <CopyIcon />}
          </button>
          {(note.format === 'markdown' || note.format === 'xml') && (
            <button
              className={`action-btn icon-btn ${showPreview ? 'active' : ''}`}
              onClick={() => setShowPreview(!showPreview)}
              title={state.lang === 'no' ? 'Forhåndsvisning' : 'Preview'}
              aria-label={state.lang === 'no' ? 'Forhåndsvisning' : 'Preview'}
              aria-pressed={showPreview}
            >
              <PreviewIcon />
            </button>
          )}
          <button className="action-btn save-btn" onClick={handleSave}>
            {t.save}
          </button>
          <button
            className="action-btn"
            onClick={() => setShowTagPicker(!showTagPicker)}
            aria-expanded={showTagPicker}
          >
            {t.assignTags}
          </button>
          <button className="action-btn" onClick={handleDelete}>
            {t.delete}
          </button>
        </div>
      </div>

      <div className="format-selector">
        <span className="format-label">{t.format}</span>
        <select
          className="format-select"
          value={note.format}
          onChange={handleFormatChange}
          aria-label={t.format}
        >
          <option value="plaintext">{t.plaintext}</option>
          <option value="richtext">{t.richtext}</option>
          <option value="markdown">{t.markdown}</option>
          <option value="xml">{t.xml}</option>
        </select>
      </div>

      {note.format === 'richtext' && (
        <div className="formatting-toolbar">
          <div className="format-group">
            <select
              className="style-select"
              value={currentBlockStyle}
              onChange={handleBlockStyleChange}
            >
              <option value="p">{t.bodyText}</option>
              <option value="h1">{t.heading1}</option>
              <option value="h2">{t.heading2}</option>
              <option value="h3">{t.heading3}</option>
            </select>
          </div>
          <div className="format-group">
            <button
              className="format-btn"
              onMouseDown={preventFocusLoss}
              onClick={() => applyFormat('bold')}
              title={`${state.lang === 'no' ? 'Fet' : 'Bold'} (${mac ? '⌘B' : 'Ctrl+B'})`}
            >
              <strong>B</strong>
            </button>
            <button
              className="format-btn"
              onMouseDown={preventFocusLoss}
              onClick={() => applyFormat('italic')}
              title={`${state.lang === 'no' ? 'Kursiv' : 'Italic'} (${mac ? '⌘I' : 'Ctrl+I'})`}
            >
              <em>I</em>
            </button>
          </div>
          <div className="format-group">
            <button
              className="format-btn"
              onMouseDown={preventFocusLoss}
              onClick={() => applyFormat('insertUnorderedList')}
              title={state.lang === 'no' ? 'Punktliste' : 'Bullet list'}
            >
              <BulletListIcon />
            </button>
            <button
              className="format-btn"
              onMouseDown={preventFocusLoss}
              onClick={() => applyFormat('insertOrderedList')}
              title={state.lang === 'no' ? 'Nummerert liste' : 'Numbered list'}
            >
              <NumberedListIcon />
            </button>
          </div>
        </div>
      )}

      {showTagPicker && (
        <div className="tag-picker show" ref={tagPickerRef}>
          <div className="tag-picker-section">
            <div className="tag-picker-title">{t.assignTags}</div>
            <div className="tag-picker-list">
              {state.tags.length === 0 ? (
                <div style={{ padding: '6px 8px', color: 'var(--text-muted)', fontSize: '12px' }}>
                  {state.lang === 'no' ? 'Ingen etiketter ennå' : 'No tags yet'}
                </div>
              ) : (
                state.tags.map(tag => (
                  <button
                    key={tag.id}
                    className="tag-picker-item"
                    onClick={() => toggleNoteTag(note.id, tag.id)}
                  >
                    <span>{tag.name}</span>
                    {note.tags.includes(tag.id) && <span className="check-mark">✓</span>}
                  </button>
                ))
              )}
            </div>
          </div>
          <div className="tag-picker-divider" />
          <div className="tag-picker-section">
            <input
              type="text"
              className="new-tag-input"
              placeholder={t.newTagPlaceholder}
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={handleTagKeyDown}
              dir="ltr"
            />
            <button className="add-tag-btn" onClick={handleAddTag}>
              {t.addTag}
            </button>
          </div>
        </div>
      )}

      {note.tags.length > 0 && (
        <div className="current-tags">
          {note.tags.map(tagId => {
            const tag = state.tags.find(t => t.id === tagId);
            return tag ? <span key={tag.id} className="current-tag">{tag.name}</span> : null;
          })}
        </div>
      )}

      <div className={`editor-container ${(note.format === 'markdown' || note.format === 'xml') && showPreview ? 'with-preview' : ''}`}>
        <div className="editor-pane">
          {note.format === 'richtext' ? (
            <RichTextEditor
              content={note.content}
              onContentChange={handleRichtextChange}
              editorRef={richtextRef}
              placeholder={t.editorPlaceholder}
            />
          ) : (
            <textarea
              ref={textareaRef}
              className={`editor ${note.format}`}
              placeholder={note.format === 'xml' ? '<?xml version="1.0"?>' : t.editorPlaceholder}
              value={note.content}
              onChange={handleContentChange}
              spellCheck={note.format === 'plaintext' || note.format === 'markdown'}
              aria-label={t.editorPlaceholder}
              dir="ltr"
            />
          )}
        </div>

        {(note.format === 'markdown' || note.format === 'xml') && showPreview && (
          <div className="preview-pane" aria-label={state.lang === 'no' ? 'Forhåndsvisning' : 'Preview'}>
            <div className="markdown-preview" dir="ltr">
              {note.format === 'markdown' ? (
                <div dangerouslySetInnerHTML={{ __html: markdownToHtml(note.content) }} />
              ) : (
                <pre className="code-preview">{note.content}</pre>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
