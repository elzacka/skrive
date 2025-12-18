import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { useApp } from '@/contexts';
import { i18n } from '@/utils/i18n';
import { useUndoRedo } from '@/hooks';
import { isMac } from '@/utils';
import type { NoteFormat } from '@/types';
import {
  CopyIcon,
  UndoIcon,
  RedoIcon,
  PreviewIcon,
  BulletListIcon,
  NumberedListIcon,
  HeadingIcon,
  CodeIcon,
  LinkIcon,
  CodeBlockIcon,
  QuoteIcon
} from './Icons';

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

// Simple markdown to HTML converter with syntax highlighting for code
function markdownToHtml(md: string): string {
  let html = md
    // Code blocks with language specification
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const languageClass = lang ? ` class="language-${lang}"` : '';
      const escapedCode = code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<pre${languageClass}><code>${escapedCode}</code></pre>`;
    })
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
    .replace(/^\d+\. (.+)$/gm, '<li class="ordered">$1</li>')
    .replace(/^---$/gm, '<hr>')
    .replace(/\n/g, '<br>');

  // Wrap consecutive list items in ul/ol
  html = html.replace(/(<li>.*?<\/li>)(\s*<br>\s*<li>.*?<\/li>)+/g, (match) => {
    return '<ul>' + match.replace(/<br>/g, '') + '</ul>';
  });
  html = html.replace(/(<li class="ordered">.*?<\/li>)(\s*<br>\s*<li class="ordered">.*?<\/li>)+/g, (match) => {
    return '<ol>' + match.replace(/<br>/g, '').replace(/ class="ordered"/g, '') + '</ol>';
  });

  return sanitizeHtml(html);
}

// Rich text editor component - separate to avoid re-render issues
function RichTextEditor({
  noteId,
  initialContent,
  onContentChange,
  editorRef,
  placeholder
}: {
  noteId: string;
  initialContent: string;
  onContentChange: (content: string) => void;
  editorRef: React.RefObject<HTMLDivElement | null>;
  placeholder: string;
}) {
  const lastNoteIdRef = useRef<string | null>(null);

  // Only set innerHTML when note changes (different noteId)
  useEffect(() => {
    if (editorRef.current && noteId !== lastNoteIdRef.current) {
      editorRef.current.innerHTML = sanitizeHtml(initialContent);
      lastNoteIdRef.current = noteId;
    }
  }, [noteId, initialContent, editorRef]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      const newContent = editorRef.current.innerHTML;
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

  // Memoize markdown preview to avoid re-conversion on every render
  const markdownPreviewHtml = useMemo(() => {
    if (note?.format === 'markdown' && note.content) {
      return markdownToHtml(note.content);
    }
    return '';
  }, [note?.format, note?.content]);

  const [showTagPicker, setShowTagPicker] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [currentBlockStyle, setCurrentBlockStyle] = useState('p');
  const [activeFormats, setActiveFormats] = useState({ bold: false, italic: false, unorderedList: false, orderedList: false });

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
    } catch {
      // Clipboard write failed
    }
  }, [note]);

  // Check current formatting state at cursor position
  const updateActiveFormats = useCallback(() => {
    setActiveFormats({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      unorderedList: document.queryCommandState('insertUnorderedList'),
      orderedList: document.queryCommandState('insertOrderedList'),
    });
  }, []);

  // Format command for rich text - uses Selection API properly
  const applyFormat = useCallback((command: string, value?: string) => {
    const editor = richtextRef.current;
    if (!editor) return;

    // Ensure editor has focus
    editor.focus();

    // Restore selection if needed
    const selection = window.getSelection();
    if (selection && selection.rangeCount === 0) {
      // No selection, place cursor at end
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    // Execute the command
    document.execCommand(command, false, value);

    // Trigger input event to save changes
    editor.dispatchEvent(new Event('input', { bubbles: true }));

    // Update active format state
    updateActiveFormats();

    // Update block style selector if formatBlock was used
    if (command === 'formatBlock' && value) {
      setCurrentBlockStyle(value);
    }
  }, [updateActiveFormats]);

  const handleRichtextChange = useCallback((content: string) => {
    if (note) {
      updateNote(note.id, { content });
      pushState(content, 0);
    }
  }, [note, updateNote, pushState]);

  // Insert markdown syntax at cursor position
  const insertMarkdown = useCallback((prefix: string, suffix: string = '', placeholder: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea || !note) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    const textToInsert = selectedText || placeholder;

    const before = textarea.value.substring(0, start);
    const after = textarea.value.substring(end);
    const newContent = before + prefix + textToInsert + suffix + after;

    updateNote(note.id, { content: newContent });
    pushState(newContent, start + prefix.length + textToInsert.length + suffix.length);

    // Set cursor position after insert
    requestAnimationFrame(() => {
      textarea.focus();
      if (selectedText) {
        // If text was selected, place cursor after the insertion
        const newPos = start + prefix.length + textToInsert.length + suffix.length;
        textarea.setSelectionRange(newPos, newPos);
      } else {
        // If no selection, select the placeholder text
        const selectStart = start + prefix.length;
        const selectEnd = selectStart + placeholder.length;
        textarea.setSelectionRange(selectStart, selectEnd);
      }
    });
  }, [note, updateNote, pushState]);

  // Keyboard shortcuts for undo/redo and formatting
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmd = e.metaKey || e.ctrlKey;

      // Undo/Redo (works globally)
      if (isCmd && !e.altKey) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          handleUndo();
          return;
        } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
          e.preventDefault();
          handleRedo();
          return;
        }
      }

      // Formatting shortcuts - only when editor has focus
      const isRichtextFocused = document.activeElement === richtextRef.current;
      const isMarkdownFocused = document.activeElement === textareaRef.current && note?.format === 'markdown';

      if (!isCmd || !note) return;

      // Rich text formatting shortcuts
      if (isRichtextFocused) {
        // Bold: Cmd/Ctrl+B
        if (e.key === 'b' && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          applyFormat('bold');
          return;
        }
        // Italic: Cmd/Ctrl+I
        if (e.key === 'i' && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          applyFormat('italic');
          return;
        }
        // Heading 1: Cmd/Ctrl+1
        if (e.key === '1' && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          applyFormat('formatBlock', 'h1');
          return;
        }
        // Heading 2: Cmd/Ctrl+2
        if (e.key === '2' && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          applyFormat('formatBlock', 'h2');
          return;
        }
        // Heading 3: Cmd/Ctrl+3
        if (e.key === '3' && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          applyFormat('formatBlock', 'h3');
          return;
        }
        // Body text: Cmd/Ctrl+0
        if (e.key === '0' && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          applyFormat('formatBlock', 'p');
          return;
        }
        // Bullet list: Cmd/Ctrl+Shift+8
        if (e.key === '8' && e.shiftKey && !e.altKey) {
          e.preventDefault();
          applyFormat('insertUnorderedList');
          return;
        }
        // Numbered list: Cmd/Ctrl+Shift+7
        if (e.key === '7' && e.shiftKey && !e.altKey) {
          e.preventDefault();
          applyFormat('insertOrderedList');
          return;
        }
      }

      // Markdown formatting shortcuts
      if (isMarkdownFocused) {
        // Bold: Cmd/Ctrl+B
        if (e.key === 'b' && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          insertMarkdown('**', '**', state.lang === 'no' ? 'fet tekst' : 'bold text');
          return;
        }
        // Italic: Cmd/Ctrl+I
        if (e.key === 'i' && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          insertMarkdown('*', '*', state.lang === 'no' ? 'kursiv tekst' : 'italic text');
          return;
        }
        // Heading: Cmd/Ctrl+1
        if (e.key === '1' && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          insertMarkdown('# ', '', state.lang === 'no' ? 'Overskrift' : 'Heading');
          return;
        }
        // Heading 2: Cmd/Ctrl+2
        if (e.key === '2' && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          insertMarkdown('## ', '', state.lang === 'no' ? 'Overskrift' : 'Heading');
          return;
        }
        // Heading 3: Cmd/Ctrl+3
        if (e.key === '3' && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          insertMarkdown('### ', '', state.lang === 'no' ? 'Overskrift' : 'Heading');
          return;
        }
        // Inline code: Cmd/Ctrl+E
        if (e.key === 'e' && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          insertMarkdown('`', '`', state.lang === 'no' ? 'kode' : 'code');
          return;
        }
        // Code block: Cmd/Ctrl+Shift+E
        if (e.key === 'e' && e.shiftKey && !e.altKey) {
          e.preventDefault();
          insertMarkdown('```\n', '\n```', state.lang === 'no' ? 'kodeblokk' : 'code block');
          return;
        }
        // Bullet list: Cmd/Ctrl+Shift+8
        if (e.key === '8' && e.shiftKey && !e.altKey) {
          e.preventDefault();
          insertMarkdown('- ', '', state.lang === 'no' ? 'listepunkt' : 'list item');
          return;
        }
        // Numbered list: Cmd/Ctrl+Shift+7
        if (e.key === '7' && e.shiftKey && !e.altKey) {
          e.preventDefault();
          insertMarkdown('1. ', '', state.lang === 'no' ? 'listepunkt' : 'list item');
          return;
        }
        // Link: Cmd/Ctrl+L
        if (e.key === 'l' && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          insertMarkdown('[', '](url)', state.lang === 'no' ? 'lenketekst' : 'link text');
          return;
        }
        // Quote: Cmd/Ctrl+Shift+.
        if (e.key === '.' && e.shiftKey && !e.altKey) {
          e.preventDefault();
          insertMarkdown('> ', '', state.lang === 'no' ? 'sitat' : 'quote');
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, note, applyFormat, insertMarkdown, state.lang]);

  // Update active formats when selection changes in richtext editor
  useEffect(() => {
    if (note?.format !== 'richtext') return;

    const handleSelectionChange = () => {
      const editor = richtextRef.current;
      if (editor && document.activeElement === editor) {
        updateActiveFormats();
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [note?.format, updateActiveFormats]);

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

    if (newFormat === 'plaintext' && oldFormat === 'richtext') {
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
    }

    updateNote(note.id, { format: newFormat, content: newContent });
    setShowPreview(newFormat === 'markdown' ? showPreview : false);

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
          {note.format === 'markdown' && (
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
        </select>
      </div>

      {note.format === 'richtext' && (
        <div className="formatting-toolbar">
          <div className="format-group">
            <select
              className="style-select"
              value={currentBlockStyle}
              onChange={handleBlockStyleChange}
              title={`${t.bodyText}: ${mac ? '⌘0' : 'Ctrl+0'} | ${t.heading1}: ${mac ? '⌘1' : 'Ctrl+1'} | ${t.heading2}: ${mac ? '⌘2' : 'Ctrl+2'} | ${t.heading3}: ${mac ? '⌘3' : 'Ctrl+3'}`}
            >
              <option value="p">{t.bodyText}</option>
              <option value="h1">{t.heading1}</option>
              <option value="h2">{t.heading2}</option>
              <option value="h3">{t.heading3}</option>
            </select>
          </div>
          <div className="format-group">
            <button
              className={`format-btn ${activeFormats.bold ? 'active' : ''}`}
              onMouseDown={preventFocusLoss}
              onClick={() => applyFormat('bold')}
              title={`${state.lang === 'no' ? 'Fet' : 'Bold'} (${mac ? '⌘B' : 'Ctrl+B'})`}
              aria-pressed={activeFormats.bold}
            >
              <strong>B</strong>
            </button>
            <button
              className={`format-btn ${activeFormats.italic ? 'active' : ''}`}
              onMouseDown={preventFocusLoss}
              onClick={() => applyFormat('italic')}
              title={`${state.lang === 'no' ? 'Kursiv' : 'Italic'} (${mac ? '⌘I' : 'Ctrl+I'})`}
              aria-pressed={activeFormats.italic}
            >
              <em>I</em>
            </button>
          </div>
          <div className="format-group">
            <button
              className={`format-btn ${activeFormats.unorderedList ? 'active' : ''}`}
              onMouseDown={preventFocusLoss}
              onClick={() => applyFormat('insertUnorderedList')}
              title={`${state.lang === 'no' ? 'Punktliste' : 'Bullet list'} (${mac ? '⌘⇧8' : 'Ctrl+Shift+8'})`}
              aria-pressed={activeFormats.unorderedList}
            >
              <BulletListIcon />
            </button>
            <button
              className={`format-btn ${activeFormats.orderedList ? 'active' : ''}`}
              onMouseDown={preventFocusLoss}
              onClick={() => applyFormat('insertOrderedList')}
              title={`${state.lang === 'no' ? 'Nummerert liste' : 'Numbered list'} (${mac ? '⌘⇧7' : 'Ctrl+Shift+7'})`}
              aria-pressed={activeFormats.orderedList}
            >
              <NumberedListIcon />
            </button>
          </div>
        </div>
      )}

      {note.format === 'markdown' && (
        <div className="formatting-toolbar">
          <div className="format-group">
            <button
              className="format-btn"
              onClick={() => insertMarkdown('# ', '', state.lang === 'no' ? 'Overskrift' : 'Heading')}
              title={`${state.lang === 'no' ? 'Overskrift' : 'Heading'} (${mac ? '⌘1/2/3' : 'Ctrl+1/2/3'})`}
            >
              <HeadingIcon />
            </button>
          </div>
          <div className="format-group">
            <button
              className="format-btn"
              onClick={() => insertMarkdown('**', '**', state.lang === 'no' ? 'fet tekst' : 'bold text')}
              title={`${state.lang === 'no' ? 'Fet' : 'Bold'} (${mac ? '⌘B' : 'Ctrl+B'})`}
            >
              <strong>B</strong>
            </button>
            <button
              className="format-btn"
              onClick={() => insertMarkdown('*', '*', state.lang === 'no' ? 'kursiv tekst' : 'italic text')}
              title={`${state.lang === 'no' ? 'Kursiv' : 'Italic'} (${mac ? '⌘I' : 'Ctrl+I'})`}
            >
              <em>I</em>
            </button>
          </div>
          <div className="format-group">
            <button
              className="format-btn"
              onClick={() => insertMarkdown('`', '`', state.lang === 'no' ? 'kode' : 'code')}
              title={`${state.lang === 'no' ? 'Inline kode' : 'Inline code'} (${mac ? '⌘E' : 'Ctrl+E'})`}
            >
              <CodeIcon />
            </button>
            <button
              className="format-btn"
              onClick={() => insertMarkdown('```\n', '\n```', state.lang === 'no' ? 'kodeblokk' : 'code block')}
              title={`${state.lang === 'no' ? 'Kodeblokk' : 'Code block'} (${mac ? '⌘⇧E' : 'Ctrl+Shift+E'})`}
            >
              <CodeBlockIcon />
            </button>
          </div>
          <div className="format-group">
            <button
              className="format-btn"
              onClick={() => insertMarkdown('- ', '', state.lang === 'no' ? 'listepunkt' : 'list item')}
              title={`${state.lang === 'no' ? 'Punktliste' : 'Bullet list'} (${mac ? '⌘⇧8' : 'Ctrl+Shift+8'})`}
            >
              <BulletListIcon />
            </button>
            <button
              className="format-btn"
              onClick={() => insertMarkdown('1. ', '', state.lang === 'no' ? 'listepunkt' : 'list item')}
              title={`${state.lang === 'no' ? 'Nummerert liste' : 'Numbered list'} (${mac ? '⌘⇧7' : 'Ctrl+Shift+7'})`}
            >
              <NumberedListIcon />
            </button>
          </div>
          <div className="format-group">
            <button
              className="format-btn"
              onClick={() => insertMarkdown('[', '](url)', state.lang === 'no' ? 'lenketekst' : 'link text')}
              title={`${state.lang === 'no' ? 'Lenke' : 'Link'} (${mac ? '⌘L' : 'Ctrl+L'})`}
            >
              <LinkIcon />
            </button>
            <button
              className="format-btn"
              onClick={() => insertMarkdown('> ', '', state.lang === 'no' ? 'sitat' : 'quote')}
              title={`${state.lang === 'no' ? 'Sitat' : 'Quote'} (${mac ? '⌘⇧.' : 'Ctrl+Shift+.'})`}
            >
              <QuoteIcon />
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

      <div className={`editor-container ${note.format === 'markdown' && showPreview ? 'with-preview' : ''}`}>
        <div className="editor-pane">
          {note.format === 'richtext' ? (
            <RichTextEditor
              noteId={note.id}
              initialContent={note.content}
              onContentChange={handleRichtextChange}
              editorRef={richtextRef}
              placeholder={t.editorPlaceholder}
            />
          ) : (
            <textarea
              ref={textareaRef}
              className={`editor ${note.format}`}
              placeholder={t.editorPlaceholder}
              value={note.content}
              onChange={handleContentChange}
              spellCheck={note.format === 'plaintext' || note.format === 'markdown'}
              aria-label={t.editorPlaceholder}
              dir="ltr"
            />
          )}
        </div>

        {note.format === 'markdown' && showPreview && (
          <div className="preview-pane" aria-label={state.lang === 'no' ? 'Forhåndsvisning' : 'Preview'}>
            <div className="markdown-preview" dir="ltr">
              <div dangerouslySetInnerHTML={{ __html: markdownPreviewHtml }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
