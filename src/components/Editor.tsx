import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '@/contexts';
import { i18n } from '@/utils/i18n';
import { useUndoRedo } from '@/hooks';
import { isMac, htmlToMarkdown, markdownToHtml, htmlToPlainText, deriveTitleFromContent, escapeHtml, formatDate } from '@/utils';
import { downloadNote } from '@/utils/fileSystem';
import { FindReplaceBar } from './FindReplaceBar';
import type { ExportFormat } from '@/utils/fileSystem';
import type { NoteFormat } from '@/types';
import { sanitizeHtml, isSafeUrl, escapeHtmlAttribute } from '@/utils/sanitize';
import {
  CopyIcon,
  UndoIcon,
  RedoIcon,
  PreviewIcon,
  BulletListIcon,
  NumberedListIcon,
  HeadingIcon,
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  StrikethroughIcon,
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

const DEFAULT_TITLES = [i18n.no.untitled, i18n.en.untitled, 'Notat', 'Note'];

// Count words and characters in content
function countWordsAndChars(content: string, format: NoteFormat): { words: number; chars: number } {
  // Strip HTML tags for richtext format
  const text = format === 'richtext'
    ? content.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
    : content;

  const chars = text.length;
  const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).filter(Boolean).length;

  return { words, chars };
}

// Rich text editor component - separate to avoid re-render issues
function RichTextEditor({
  noteId,
  initialContent,
  onContentChange,
  onEnterCapture,
  editorRef,
  placeholder
}: {
  noteId: string;
  initialContent: string;
  onContentChange: (content: string) => void;
  onEnterCapture: () => boolean;
  editorRef: React.RefObject<HTMLDivElement | null>;
  placeholder: string;
}) {
  const lastNoteIdRef = useRef<string | null>(null);
  const initialContentRef = useRef<string>(initialContent);

  // Update ref when initialContent changes (for use when noteId changes)
  if (noteId !== lastNoteIdRef.current) {
    initialContentRef.current = initialContent;
  }

  // Only set innerHTML when note changes (different noteId)
  useEffect(() => {
    // Chrome's default block is <div>; using <p> keeps the DOM consistent
    // with the sanitizer whitelist and the converters. styleWithCSS off
    // makes execCommand emit tags (b/i) instead of styled spans
    document.execCommand('defaultParagraphSeparator', false, 'p');
    document.execCommand('styleWithCSS', false, 'false');
    if (editorRef.current && noteId !== lastNoteIdRef.current) {
      // Seed empty notes with an empty paragraph: text typed directly
      // into the editor root becomes a bare text node, which makes
      // execCommand produce invalid nesting later
      editorRef.current.innerHTML = sanitizeHtml(initialContentRef.current) || '<p><br></p>';
      lastNoteIdRef.current = noteId;
    }
  }, [noteId, editorRef]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      // Sanitize on write so stored content is always clean, not only
      // at render time (pasted HTML can carry unsafe markup)
      const newContent = sanitizeHtml(editorRef.current.innerHTML);
      onContentChange(newContent);
    }
  }, [editorRef, onContentChange]);

  const notifyInput = useCallback(() => {
    editorRef.current?.dispatchEvent(new Event('input', { bubbles: true }));
  }, [editorRef]);

  // Markdown-style input rules and URL auto-linking, hooked on beforeinput
  // (fires for semantic text insertion, independent of keyboard layout)
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const applyBlockTrigger = (trigger: string): boolean => {
      if (trigger === '-' || trigger === '*') {
        document.execCommand('insertUnorderedList');
      } else if (/^\d+\.$/.test(trigger)) {
        document.execCommand('insertOrderedList');
      } else if (/^#{1,3}$/.test(trigger)) {
        document.execCommand('formatBlock', false, `h${trigger.length}`);
      } else if (trigger === '>') {
        document.execCommand('formatBlock', false, 'blockquote');
      } else {
        return false;
      }
      return true;
    };

    // "- ", "1. ", "# ".."### ", "> " at line start become formatting
    const handleSpace = (e: InputEvent) => {
      const selection = window.getSelection();
      if (!selection || !selection.isCollapsed || selection.rangeCount === 0) return;
      const node = selection.anchorNode;
      if (!node || node.nodeType !== Node.TEXT_NODE) return;
      const textNode = node as Text;
      const offset = selection.anchorOffset;
      const before = textNode.data.slice(0, offset);
      const parent = textNode.parentElement;
      if (!parent) return;

      const isLineStart = !textNode.previousSibling &&
        (parent === editor || parent.tagName === 'P' || parent.tagName === 'DIV') &&
        !parent.closest('li, pre, blockquote');
      if (isLineStart && /^(-|\*|#{1,3}|>|\d+\.)$/.test(before)) {
        e.preventDefault();
        textNode.deleteData(0, offset);
        // An empty text node left behind makes Chrome resolve the caret
        // to the PREVIOUS block and format the wrong paragraph; replace
        // it with the <br> an empty block normally holds
        if (parent !== editor && textNode.data.length === 0) {
          textNode.remove();
          if (!parent.hasChildNodes()) {
            parent.appendChild(document.createElement('br'));
          }
        }
        const caret = document.createRange();
        caret.selectNodeContents(parent === editor ? editor : parent);
        caret.collapse(true);
        selection.removeAllRanges();
        selection.addRange(caret);
        if (applyBlockTrigger(before)) {
          // Chrome nests the new list inside the emptied paragraph
          const nested = parent !== editor && parent.childNodes.length === 1
            ? parent.firstElementChild
            : null;
          if (nested && (nested.tagName === 'UL' || nested.tagName === 'OL')) {
            parent.replaceWith(nested);
          }
          notifyInput();
        }
        return;
      }

      // Typed URL followed by space becomes a link
      if (!parent.closest('a')) {
        const urlMatch = before.match(/(?:^|\s)(https?:\/\/[^\s]+)$/);
        if (urlMatch && isSafeUrl(urlMatch[1])) {
          const url = urlMatch[1];
          e.preventDefault();
          const range = document.createRange();
          range.setStart(textNode, offset - url.length);
          range.setEnd(textNode, offset);
          selection.removeAllRanges();
          selection.addRange(range);
          document.execCommand('insertHTML', false,
            `<a href="${escapeHtmlAttribute(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>&nbsp;`);
          notifyInput();
        }
      }
    };

    // Closing "**bold**" or "*italic*" applies the formatting
    const handleStar = (e: InputEvent) => {
      const selection = window.getSelection();
      if (!selection || !selection.isCollapsed || selection.rangeCount === 0) return;
      const node = selection.anchorNode;
      if (!node || node.nodeType !== Node.TEXT_NODE) return;
      const textNode = node as Text;
      const offset = selection.anchorOffset;
      const before = textNode.data.slice(0, offset);

      const bold = before.match(/\*\*([^*]+)\*$/);
      const italic = bold ? null : before.match(/(?:^|[^*])\*([^*]+)$/);
      const inner = bold ? bold[1] : italic?.[1];
      if (!inner || inner.trim() !== inner) return;

      const patternLength = bold ? bold[0].length : inner.length + 1;
      e.preventDefault();
      const range = document.createRange();
      range.setStart(textNode, offset - patternLength);
      range.setEnd(textNode, offset);
      selection.removeAllRanges();
      selection.addRange(range);
      const tag = bold ? 'strong' : 'em';
      document.execCommand('insertHTML', false, `<${tag}>${escapeHtml(inner)}</${tag}>`);
      // Keep further typing unformatted
      const command = bold ? 'bold' : 'italic';
      if (document.queryCommandState(command)) {
        document.execCommand(command);
      }
      notifyInput();
    };

    // A caret anchored on the editor root (e.g. right after focus) makes
    // typed text a bare text node outside any block, which later breaks
    // execCommand; move it into the block at that position
    const normalizeRootCaret = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return;
      if (selection.anchorNode !== editor || editor.childNodes.length === 0) return;
      const atEnd = selection.anchorOffset >= editor.childNodes.length;
      const child = editor.childNodes[atEnd ? editor.childNodes.length - 1 : selection.anchorOffset];
      if (!child) return;
      const range = document.createRange();
      range.selectNodeContents(child);
      range.collapse(!atEnd);
      selection.removeAllRanges();
      selection.addRange(range);
    };

    const handleBeforeInput = (e: Event) => {
      const ie = e as InputEvent;
      if (ie.inputType !== 'insertText' || !ie.data) return;
      normalizeRootCaret();
      if (ie.data === ' ') {
        handleSpace(ie);
      } else if (ie.data === '*') {
        handleStar(ie);
      }
    };

    const handleFocus = () => {
      requestAnimationFrame(normalizeRootCaret);
    };

    editor.addEventListener('beforeinput', handleBeforeInput);
    editor.addEventListener('focus', handleFocus);
    return () => {
      editor.removeEventListener('beforeinput', handleBeforeInput);
      editor.removeEventListener('focus', handleFocus);
    };
  }, [editorRef, notifyInput]);

  // Smart paste: a URL over selected text becomes a link; plain-text
  // markdown is converted to formatting
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    const text = e.clipboardData.getData('text/plain').trim();
    const hasHtml = e.clipboardData.types.includes('text/html');
    const selection = window.getSelection();

    if (text && /^https?:\/\/\S+$/.test(text) && isSafeUrl(text) &&
        selection && !selection.isCollapsed) {
      e.preventDefault();
      document.execCommand('createLink', false, text);
      notifyInput();
      return;
    }

    if (text && !hasHtml && /^(#{1,6}\s|[-*]\s|\d+\.\s|>\s)/m.test(text)) {
      e.preventDefault();
      document.execCommand('insertHTML', false, markdownToHtml(text));
      notifyInput();
    }
  }, [notifyInput]);

  // Handle Enter key in lists to continue the list
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return;

    // Naming flow: the first line of an unnamed note becomes its name
    // and leaves the content
    if (onEnterCapture()) {
      e.preventDefault();
      const editor = editorRef.current;
      if (editor) {
        editor.innerHTML = '<p><br></p>';
        const selection = window.getSelection();
        if (selection && editor.firstChild) {
          const range = document.createRange();
          range.selectNodeContents(editor.firstChild);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    // Find if we're inside a list item
    let node: Node | null = selection.anchorNode;
    // The caret can anchor on the list element itself (offset = item
    // index); descend into the list item so the walk below finds it
    if (node && (node.nodeName === 'UL' || node.nodeName === 'OL') && node.childNodes.length > 0) {
      node = node.childNodes[Math.min(selection.anchorOffset, node.childNodes.length - 1)];
    }
    let listItem: HTMLLIElement | null = null;
    let list: HTMLUListElement | HTMLOListElement | null = null;

    while (node && node !== editorRef.current) {
      if (node.nodeName === 'LI') {
        listItem = node as HTMLLIElement;
      }
      if (node.nodeName === 'UL' || node.nodeName === 'OL') {
        list = node as HTMLUListElement | HTMLOListElement;
        break;
      }
      node = node.parentNode;
    }

    if (!listItem || !list) return;

    // Check if the current list item is empty
    const isEmpty = listItem.textContent?.trim() === '';

    if (isEmpty) {
      // Exit the list: insert a paragraph after the list and move the
      // caret there BEFORE removing the empty item (removing the node
      // holding the selection first would invalidate the caret)
      e.preventDefault();
      const paragraph = document.createElement('p');
      paragraph.appendChild(document.createElement('br'));
      list.parentNode?.insertBefore(paragraph, list.nextSibling);

      const range = document.createRange();
      range.setStart(paragraph, 0);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);

      listItem.remove();
      if (list.children.length === 0) {
        list.remove();
      }

      editorRef.current?.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // If not empty, let browser handle creating new list item naturally
  }, [editorRef, onEnterCapture]);

  return (
    <div
      ref={editorRef}
      className="editor richtext"
      contentEditable
      dir="ltr"
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      aria-label={placeholder}
      data-placeholder={placeholder}
      suppressContentEditableWarning
    />
  );
}

export function Editor() {
  const { state, getSelectedNote, updateNote, deleteNote, saveCurrentNote, addTag, toggleNoteTag, saveStatus } = useApp();
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
  // Bumped by the new-tag shortcut; focuses the input after the picker renders
  const [tagFocusTick, setTagFocusTick] = useState(0);
  const [newTagName, setNewTagName] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [showFind, setShowFind] = useState(false);
  const [findFocusTick, setFindFocusTick] = useState(0);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [copyMdFeedback, setCopyMdFeedback] = useState(false);
  const [currentBlockStyle, setCurrentBlockStyle] = useState('p');
  const [activeFormats, setActiveFormats] = useState({ bold: false, italic: false, underline: false, strikethrough: false, unorderedList: false, orderedList: false });
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [savedSelection, setSavedSelection] = useState<Range | null>(null);
  const [savedTextRange, setSavedTextRange] = useState<{ start: number; end: number } | null>(null);
  const [bubblePos, setBubblePos] = useState<{ x: number; y: number; below: boolean } | null>(null);

  const tagPickerRef = useRef<HTMLDivElement>(null);

  // Focus the new-tag input after the picker has rendered (shortcut path)
  useEffect(() => {
    if (tagFocusTick > 0) {
      (document.querySelector('.new-tag-input') as HTMLInputElement | null)?.focus();
    }
  }, [tagFocusTick]);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const richtextRef = useRef<HTMLDivElement>(null);
  const lastNoteIdRef = useRef<string | null>(null);

  const { pushState, undo, redo, canUndo, canRedo, reset } = useUndoRedo(note?.content || '');

  // Reset state when note changes
  useEffect(() => {
    if (note && note.id !== lastNoteIdRef.current) {
      lastNoteIdRef.current = note.id;
      reset(note.content);
      setCurrentBlockStyle('p');
      setShowFind(false);

      requestAnimationFrame(() => {
        if (note.format === 'richtext') {
          richtextRef.current?.focus();
        } else {
          textareaRef.current?.focus();
        }
      });
    }
  }, [note?.id, note?.content, note?.format, reset]);

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

  // Escape closes open dialogs and menus (WCAG: keyboard-dismissable)
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showLinkDialog) {
        setShowLinkDialog(false);
        richtextRef.current?.focus();
      } else if (showTagPicker) {
        setShowTagPicker(false);
      } else if (showExportMenu) {
        setShowExportMenu(false);
      } else if (showFind) {
        setShowFind(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showLinkDialog, showTagPicker, showExportMenu, showFind]);

  const handleUndo = useCallback(() => {
    // Richtext uses the browser's native undo stack: applying history to
    // state would not update the contentEditable DOM (it only re-renders
    // on note change) and the two would silently diverge
    if (note?.format === 'richtext') {
      richtextRef.current?.focus();
      document.execCommand('undo');
      return;
    }
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
    if (note?.format === 'richtext') {
      richtextRef.current?.focus();
      document.execCommand('redo');
      return;
    }
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
      if (note.format === 'richtext' && typeof ClipboardItem !== 'undefined') {
        // Rich copy: formatted for Word/mail, readable text everywhere else.
        // Copying the raw HTML source would paste literal tags
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([note.content], { type: 'text/html' }),
            'text/plain': new Blob([htmlToPlainText(note.content)], { type: 'text/plain' })
          })
        ]);
      } else {
        await navigator.clipboard.writeText(note.content);
      }
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1500);
    } catch {
      // Clipboard write failed
    }
  }, [note]);

  const handleCopyAsMarkdown = useCallback(async () => {
    if (!note || note.format !== 'richtext') return;

    try {
      const markdown = htmlToMarkdown(note.content);
      await navigator.clipboard.writeText(markdown);
      setCopyMdFeedback(true);
      setTimeout(() => setCopyMdFeedback(false), 1500);
    } catch {
      // Clipboard write failed
    }
  }, [note]);

  // Check current formatting state at cursor position
  const updateActiveFormats = useCallback(() => {
    setActiveFormats({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strikethrough: document.queryCommandState('strikeThrough'),
      unorderedList: document.queryCommandState('insertUnorderedList'),
      orderedList: document.queryCommandState('insertOrderedList'),
    });
  }, []);

  // Open link dialog and save the current selection (richtext Range or
  // textarea offsets, depending on format)
  const openLinkDialog = useCallback(() => {
    if (note?.format === 'markdown') {
      const textarea = textareaRef.current;
      if (textarea) {
        setSavedTextRange({ start: textarea.selectionStart, end: textarea.selectionEnd });
        setLinkText(textarea.value.substring(textarea.selectionStart, textarea.selectionEnd));
      }
    } else {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        setSavedSelection(range.cloneRange());
        setLinkText(selection.toString());
      }
    }
    setLinkUrl('');
    setShowLinkDialog(true);
  }, [note?.format]);

  // Insert a markdown link at the saved textarea selection
  const insertMarkdownLink = useCallback((url: string) => {
    const textarea = textareaRef.current;
    if (!textarea || !note || !savedTextRange) return;
    const text = linkText || url;
    const markdownLink = `[${text}](${url})`;
    const value = note.content;
    const newContent = value.slice(0, savedTextRange.start) + markdownLink + value.slice(savedTextRange.end);
    const position = savedTextRange.start + markdownLink.length;
    updateNote(note.id, { content: newContent });
    pushState(newContent, position);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(position, position);
    });
  }, [note, savedTextRange, linkText, updateNote, pushState]);

  // Insert link at saved selection
  const insertLink = useCallback(() => {
    if (!linkUrl) {
      setShowLinkDialog(false);
      return;
    }

    // Validate URL before inserting
    const url = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`;
    if (!isSafeUrl(url)) {
      setShowLinkDialog(false);
      return;
    }

    if (note?.format === 'markdown') {
      insertMarkdownLink(url);
      setShowLinkDialog(false);
      setLinkUrl('');
      setLinkText('');
      setSavedTextRange(null);
      return;
    }

    if (!richtextRef.current) {
      setShowLinkDialog(false);
      return;
    }

    const editor = richtextRef.current;
    editor.focus();

    // Restore the saved selection
    const selection = window.getSelection();
    if (selection && savedSelection) {
      selection.removeAllRanges();
      selection.addRange(savedSelection);
    }

    // Create the link
    const text = linkText || linkUrl;

    if (selection && selection.toString()) {
      // Wrap selected text in link
      document.execCommand('createLink', false, url);
    } else {
      // Insert new link with text
      const link = document.createElement('a');
      link.href = url;
      link.textContent = text;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.execCommand('insertHTML', false, link.outerHTML);
    }

    // Trigger input event to save changes
    editor.dispatchEvent(new Event('input', { bubbles: true }));

    // Reset state
    setShowLinkDialog(false);
    setLinkUrl('');
    setLinkText('');
    setSavedSelection(null);
  }, [linkUrl, linkText, savedSelection, note?.format, insertMarkdownLink]);

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

  // Naming flow: in an unnamed note, the first line plus Enter becomes the
  // note's name and is REMOVED from the content, so exports contain only
  // the actual content. Returns whether the capture happened
  const captureNoteName = useCallback((): boolean => {
    if (!note) return false;
    const isUnnamed = !note.title || DEFAULT_TITLES.includes(note.title);
    if (!isUnnamed) return false;
    const text = note.format === 'richtext' ? htmlToPlainText(note.content) : note.content;
    if (!text.trim() || text.includes('\n')) return false;
    const name = deriveTitleFromContent(note.content, note.format);
    if (!name) return false;
    updateNote(note.id, { title: name, content: '' });
    pushState('', 0);
    return true;
  }, [note, updateNote, pushState]);

  // Insert markdown syntax at cursor position
  const insertMarkdown = useCallback((prefix: string, suffix: string = '', placeholder: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea || !note) return;

    // Save scroll position before any changes
    const scrollTop = textarea.scrollTop;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    const textToInsert = selectedText || placeholder;

    const before = textarea.value.substring(0, start);
    const after = textarea.value.substring(end);
    const newContent = before + prefix + textToInsert + suffix + after;

    updateNote(note.id, { content: newContent });
    pushState(newContent, start + prefix.length + textToInsert.length + suffix.length);

    // Set cursor position after insert and restore scroll
    requestAnimationFrame(() => {
      textarea.focus({ preventScroll: true });
      if (selectedText) {
        // If text was selected, place cursor after the insertion
        const newPos = start + prefix.length + textToInsert.length + suffix.length;
        textarea.setSelectionRange(newPos, newPos);
      } else if (placeholder) {
        // If no selection but has placeholder, select the placeholder text
        const selectStart = start + prefix.length;
        const selectEnd = selectStart + placeholder.length;
        textarea.setSelectionRange(selectStart, selectEnd);
      } else {
        // No selection and no placeholder, place cursor after prefix
        const newPos = start + prefix.length;
        textarea.setSelectionRange(newPos, newPos);
      }
      // Restore scroll position
      textarea.scrollTop = scrollTop;
    });
  }, [note, updateNote, pushState]);

  // Toggle a single line's list prefix, returns the transformed line and length delta
  const toggleLineList = useCallback((line: string, listType: 'bullet' | 'numbered', num: number): { line: string; delta: number } => {
    const bulletMatch = line.match(/^(\s*)([-*])\s(.*)$/);
    const numberedMatch = line.match(/^(\s*)(\d+)\.\s(.*)$/);

    if (listType === 'bullet') {
      if (bulletMatch) {
        return { line: bulletMatch[1] + bulletMatch[3], delta: -2 };
      } else if (numberedMatch) {
        const numPrefix = numberedMatch[2].length + 2;
        return { line: numberedMatch[1] + '- ' + numberedMatch[3], delta: 2 - numPrefix };
      } else {
        return { line: '- ' + line, delta: 2 };
      }
    } else {
      if (numberedMatch) {
        const numPrefix = numberedMatch[2].length + 2;
        return { line: numberedMatch[1] + numberedMatch[3], delta: -numPrefix };
      } else if (bulletMatch) {
        const prefix = `${num}. `;
        return { line: bulletMatch[1] + prefix + bulletMatch[3], delta: prefix.length - 2 };
      } else {
        const prefix = `${num}. `;
        return { line: prefix + line, delta: prefix.length };
      }
    }
  }, []);

  // Toggle markdown list (bullet or numbered) - supports multi-line selections
  const toggleMarkdownList = useCallback((listType: 'bullet' | 'numbered') => {
    const textarea = textareaRef.current;
    if (!textarea || !note) return;

    const scrollTop = textarea.scrollTop;
    const { value, selectionStart, selectionEnd } = textarea;

    // Find the full range of lines covered by the selection
    const blockStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    let blockEnd = value.indexOf('\n', selectionEnd);
    if (blockEnd === -1) blockEnd = value.length;

    const selectedBlock = value.substring(blockStart, blockEnd);
    const lines = selectedBlock.split('\n');

    let totalDelta = 0;
    const newLines = lines.map((line, i) => {
      const { line: newLine, delta } = toggleLineList(line, listType, i + 1);
      totalDelta += delta;
      return newLine;
    });

    const before = value.substring(0, blockStart);
    const after = value.substring(blockEnd);
    const newContent = before + newLines.join('\n') + after;
    const newEnd = selectionEnd + totalDelta;

    updateNote(note.id, { content: newContent });
    pushState(newContent, newEnd);

    requestAnimationFrame(() => {
      textarea.focus({ preventScroll: true });
      // Preserve selection across transformed lines
      const firstLineDelta = newLines[0].length - lines[0].length;
      const newStart = Math.max(blockStart, selectionStart + firstLineDelta);
      textarea.setSelectionRange(newStart, newEnd);
      textarea.scrollTop = scrollTop;
    });
  }, [note, updateNote, pushState, toggleLineList]);

  // Transform each line covered by the selection (line-prefix operations
  // like headings and quotes must not insert mid-line)
  const transformMarkdownLines = useCallback((transform: (line: string) => string) => {
    const textarea = textareaRef.current;
    if (!textarea || !note) return;

    const scrollTop = textarea.scrollTop;
    const { value, selectionStart, selectionEnd } = textarea;
    const blockStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    let blockEnd = value.indexOf('\n', selectionEnd);
    if (blockEnd === -1) blockEnd = value.length;

    const newBlock = value.substring(blockStart, blockEnd).split('\n').map(transform).join('\n');
    const newContent = value.substring(0, blockStart) + newBlock + value.substring(blockEnd);
    const newEnd = blockStart + newBlock.length;

    updateNote(note.id, { content: newContent });
    pushState(newContent, newEnd);

    requestAnimationFrame(() => {
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(Math.min(selectionStart, newEnd), newEnd);
      textarea.scrollTop = scrollTop;
    });
  }, [note, updateNote, pushState]);

  // Heading button cycles none -> H1 -> H2 -> H3 -> none
  const cycleMarkdownHeading = useCallback(() => {
    transformMarkdownLines(line => {
      if (/^###\s/.test(line)) return line.replace(/^###\s/, '');
      if (/^##\s/.test(line)) return line.replace(/^##\s/, '### ');
      if (/^#\s/.test(line)) return line.replace(/^#\s/, '## ');
      return '# ' + line;
    });
  }, [transformMarkdownLines]);

  // Shortcut sets an exact heading level (0 = body text)
  const setMarkdownHeading = useCallback((level: number) => {
    transformMarkdownLines(line => {
      const stripped = line.replace(/^#{1,6}\s+/, '');
      return level === 0 ? stripped : '#'.repeat(level) + ' ' + stripped;
    });
  }, [transformMarkdownLines]);

  const toggleMarkdownQuote = useCallback(() => {
    transformMarkdownLines(line =>
      line.startsWith('> ') ? line.slice(2) : '> ' + line
    );
  }, [transformMarkdownLines]);

  // Keyboard shortcuts for undo/redo and formatting.
  // All checks use e.code (physical key): with Shift or Alt held, e.key
  // reports the shifted character and varies by keyboard layout, so
  // e.key-based checks silently break on Windows and non-US layouts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmd = e.metaKey || e.ctrlKey;
      const mac = isMac();

      // Undo/Redo - only for plain text and markdown
      // For rich text (contentEditable), let browser handle native undo/redo
      const isRichtextFocused = document.activeElement === richtextRef.current;

      if (isCmd && !e.altKey && !isRichtextFocused) {
        if (e.code === 'KeyZ' && !e.shiftKey) {
          e.preventDefault();
          handleUndo();
          return;
        } else if ((e.code === 'KeyZ' && e.shiftKey) || e.code === 'KeyY') {
          e.preventDefault();
          handleRedo();
          return;
        }
      }

      // Find and replace: Cmd/Ctrl+F
      if (isCmd && !e.altKey && !e.shiftKey && e.code === 'KeyF' && note) {
        e.preventDefault();
        setShowFind(true);
        setFindFocusTick(tick => tick + 1);
        return;
      }

      // New tag: Mac Opt+T, Windows Ctrl+Shift+4 - opens the tag picker
      // with the new-tag input focused (same scheme as new note/folder)
      const newTagCombo = mac
        ? (e.altKey && !e.metaKey && !e.shiftKey && !e.ctrlKey && e.code === 'KeyT')
        : (e.ctrlKey && e.shiftKey && !e.altKey && e.code === 'Digit4');
      if (newTagCombo && note) {
        e.preventDefault();
        setShowTagPicker(true);
        setTagFocusTick(tick => tick + 1);
        return;
      }

      // Formatting shortcuts - only when editor has focus
      const isMarkdownFocused = document.activeElement === textareaRef.current && note?.format === 'markdown';

      if (!isCmd || !note) return;

      // Headings: Cmd+Opt+digit on Mac (Cmd+digit switches browser tabs),
      // Ctrl+digit on Windows (Ctrl+Alt would collide with AltGr)
      const headingCombo = !e.shiftKey && (mac ? e.altKey : !e.altKey);
      const headingLevel = headingCombo
        ? ({ Digit1: 1, Digit2: 2, Digit3: 3, Digit0: 0 } as Record<string, number>)[e.code]
        : undefined;

      // Rich text formatting shortcuts
      if (isRichtextFocused) {
        if (headingLevel !== undefined) {
          e.preventDefault();
          applyFormat('formatBlock', headingLevel === 0 ? 'p' : `h${headingLevel}`);
          return;
        }
        if (e.altKey) return;
        // Bold: Cmd/Ctrl+B
        if (e.code === 'KeyB' && !e.shiftKey) {
          e.preventDefault();
          applyFormat('bold');
          return;
        }
        // Italic: Cmd/Ctrl+I
        if (e.code === 'KeyI' && !e.shiftKey) {
          e.preventDefault();
          applyFormat('italic');
          return;
        }
        // Underline: Cmd/Ctrl+U
        if (e.code === 'KeyU' && !e.shiftKey) {
          e.preventDefault();
          applyFormat('underline');
          return;
        }
        // Strikethrough: Cmd/Ctrl+Shift+X
        if (e.code === 'KeyX' && e.shiftKey) {
          e.preventDefault();
          applyFormat('strikeThrough');
          return;
        }
        // Bullet list: Cmd/Ctrl+Shift+8
        if (e.code === 'Digit8' && e.shiftKey) {
          e.preventDefault();
          applyFormat('insertUnorderedList');
          return;
        }
        // Numbered list: Cmd/Ctrl+Shift+7
        if (e.code === 'Digit7' && e.shiftKey) {
          e.preventDefault();
          applyFormat('insertOrderedList');
          return;
        }
        // Quote: Cmd/Ctrl+Shift+.
        if (e.code === 'Period' && e.shiftKey) {
          e.preventDefault();
          applyFormat('formatBlock', 'blockquote');
          return;
        }
        // Link: Cmd/Ctrl+K
        if (e.code === 'KeyK' && !e.shiftKey) {
          e.preventDefault();
          openLinkDialog();
          return;
        }
      }

      // Markdown formatting shortcuts
      if (isMarkdownFocused) {
        if (headingLevel !== undefined) {
          e.preventDefault();
          setMarkdownHeading(headingLevel);
          return;
        }
        if (e.altKey) return;
        // Bold: Cmd/Ctrl+B
        if (e.code === 'KeyB' && !e.shiftKey) {
          e.preventDefault();
          insertMarkdown('**', '**', state.lang === 'no' ? 'fet tekst' : 'bold text');
          return;
        }
        // Italic: Cmd/Ctrl+I
        if (e.code === 'KeyI' && !e.shiftKey) {
          e.preventDefault();
          insertMarkdown('*', '*', state.lang === 'no' ? 'kursiv tekst' : 'italic text');
          return;
        }
        // Strikethrough: Cmd/Ctrl+Shift+X
        if (e.code === 'KeyX' && e.shiftKey) {
          e.preventDefault();
          insertMarkdown('~~', '~~', state.lang === 'no' ? 'gjennomstreket' : 'strikethrough');
          return;
        }
        // Inline code: Cmd/Ctrl+E
        if (e.code === 'KeyE' && !e.shiftKey) {
          e.preventDefault();
          insertMarkdown('`', '`', state.lang === 'no' ? 'kode' : 'code');
          return;
        }
        // Code block: Cmd/Ctrl+Shift+E
        if (e.code === 'KeyE' && e.shiftKey) {
          e.preventDefault();
          insertMarkdown('```\n', '\n```', state.lang === 'no' ? 'kodeblokk' : 'code block');
          return;
        }
        // Bullet list: Cmd/Ctrl+Shift+8
        if (e.code === 'Digit8' && e.shiftKey) {
          e.preventDefault();
          toggleMarkdownList('bullet');
          return;
        }
        // Numbered list: Cmd/Ctrl+Shift+7
        if (e.code === 'Digit7' && e.shiftKey) {
          e.preventDefault();
          toggleMarkdownList('numbered');
          return;
        }
        // Link: Cmd/Ctrl+K (same dialog and binding as rich text)
        if (e.code === 'KeyK' && !e.shiftKey) {
          e.preventDefault();
          openLinkDialog();
          return;
        }
        // Quote: Cmd/Ctrl+Shift+.
        if (e.code === 'Period' && e.shiftKey) {
          e.preventDefault();
          toggleMarkdownQuote();
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, note, applyFormat, insertMarkdown, toggleMarkdownList, setMarkdownHeading, toggleMarkdownQuote, openLinkDialog, state.lang]);

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

  // Selection bubble: a small formatting menu floats above selected text
  useEffect(() => {
    if (note?.format !== 'richtext') {
      setBubblePos(null);
      return;
    }

    const update = () => {
      const editor = richtextRef.current;
      const selection = window.getSelection();
      if (!editor || !selection || selection.isCollapsed || selection.rangeCount === 0 ||
          !editor.contains(selection.anchorNode) || !editor.contains(selection.focusNode)) {
        setBubblePos(null);
        return;
      }
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setBubblePos(null);
        return;
      }
      // Flip below the selection when there is no room above it
      const editorTop = editor.getBoundingClientRect().top;
      const below = rect.top - 44 < editorTop;
      setBubblePos({
        x: rect.left + rect.width / 2,
        y: below ? rect.bottom : rect.top,
        below
      });
    };

    const hide = () => setBubblePos(null);
    const editor = richtextRef.current;
    document.addEventListener('selectionchange', update);
    editor?.addEventListener('scroll', hide);
    return () => {
      document.removeEventListener('selectionchange', update);
      editor?.removeEventListener('scroll', hide);
    };
  }, [note?.format, note?.id]);

  // Arrow keys move focus within a toolbar (WAI-ARIA toolbar pattern)
  const handleToolbarKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button, select'));
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (index === -1) return;
    e.preventDefault();
    const next = e.key === 'ArrowRight' ? index + 1 : index + items.length - 1;
    items[next % items.length].focus();
  };

  if (!note) {
    const newNoteShortcut = mac ? '\u2325N' : 'Ctrl+Shift+1';
    return (
      <div className="editor-panel">
        <div className="no-selection">
          <span className="empty-state-hint">
            {t.click} <span className="hint-badge">+</span> {t.orPress} <span className="hint-badge">{newNoteShortcut}</span>
          </span>
        </div>
      </div>
    );
  }

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const content = e.target.value;
    const cursorPosition = e.target.selectionStart;
    updateNote(note.id, { content });
    pushState(content, cursorPosition);
  };

  // Handle Enter in the textarea: naming flow first, then Markdown lists
  const handleMarkdownKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return;

    // Naming flow: the first line of an unnamed note becomes its name
    // and leaves the content
    if (captureNoteName()) {
      e.preventDefault();
      requestAnimationFrame(() => {
        textareaRef.current?.setSelectionRange(0, 0);
      });
      return;
    }

    if (note?.format !== 'markdown') return;

    const textarea = textareaRef.current;
    if (!textarea) return;

    const { value, selectionStart } = textarea;
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const currentLine = value.substring(lineStart, selectionStart);

    // Check for bullet list (- or *)
    const bulletMatch = currentLine.match(/^(\s*)([-*])\s(.*)$/);
    if (bulletMatch) {
      const [, indent, bullet, content] = bulletMatch;
      if (content.trim() === '') {
        // Empty item - exit list
        e.preventDefault();
        const before = value.substring(0, lineStart);
        const after = value.substring(selectionStart);
        const newContent = before + after;
        updateNote(note.id, { content: newContent });
        pushState(newContent, lineStart);
        requestAnimationFrame(() => {
          textarea.setSelectionRange(lineStart, lineStart);
        });
      } else {
        // Continue list
        e.preventDefault();
        const newItem = `\n${indent}${bullet} `;
        const before = value.substring(0, selectionStart);
        const after = value.substring(selectionStart);
        const newContent = before + newItem + after;
        const newPos = selectionStart + newItem.length;
        updateNote(note.id, { content: newContent });
        pushState(newContent, newPos);
        requestAnimationFrame(() => {
          textarea.setSelectionRange(newPos, newPos);
        });
      }
      return;
    }

    // Check for numbered list (1. 2. etc.)
    const numberedMatch = currentLine.match(/^(\s*)(\d+)\.\s(.*)$/);
    if (numberedMatch) {
      const [, indent, num, content] = numberedMatch;
      if (content.trim() === '') {
        // Empty item - exit list
        e.preventDefault();
        const before = value.substring(0, lineStart);
        const after = value.substring(selectionStart);
        const newContent = before + after;
        updateNote(note.id, { content: newContent });
        pushState(newContent, lineStart);
        requestAnimationFrame(() => {
          textarea.setSelectionRange(lineStart, lineStart);
        });
      } else {
        // Continue list with incremented number
        e.preventDefault();
        const nextNum = parseInt(num, 10) + 1;
        const newItem = `\n${indent}${nextNum}. `;
        const before = value.substring(0, selectionStart);
        const after = value.substring(selectionStart);
        const newContent = before + newItem + after;
        const newPos = selectionStart + newItem.length;
        updateNote(note.id, { content: newContent });
        pushState(newContent, newPos);
        requestAnimationFrame(() => {
          textarea.setSelectionRange(newPos, newPos);
        });
      }
      return;
    }
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
    } else if (newFormat === 'markdown' && oldFormat === 'richtext') {
      newContent = htmlToMarkdown(note.content);
    } else if (newFormat === 'richtext' && oldFormat === 'markdown') {
      newContent = markdownToHtml(note.content);
    } else if (newFormat === 'richtext' && oldFormat === 'plaintext') {
      newContent = note.content
        ? note.content.split('\n').map(line => `<p>${line ? escapeHtml(line) : '<br>'}</p>`).join('')
        : '';
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

  // No confirm dialog: deletion shows an undo toast instead
  const handleDelete = () => {
    deleteNote(note.id);
  };

  const handleSave = async () => {
    try {
      await saveCurrentNote();
    } catch {
      // Export failed or was cancelled
    }
  };

  const handleExport = (format: ExportFormat = 'native') => {
    if (!note) return;
    downloadNote(note, format);
    setShowExportMenu(false);
  };

  const getSaveStatusText = () => {
    switch (saveStatus) {
      case 'saving': return t.saving;
      case 'unsaved': return t.unsaved;
      case 'error': return t.saveError;
      default: return t.saved;
    }
  };

  // Prevent default on mousedown to keep focus in editor
  const preventFocusLoss = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  // Unnamed notes get the naming instruction; named notes a plain prompt
  const isUnnamed = !note.title || DEFAULT_TITLES.includes(note.title);
  const placeholderText = isUnnamed ? t.editorPlaceholder : t.writeHere;

  return (
    <div className="editor-panel">
      <div className="editor-header">
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
        <div className="header-actions">
          <span className={`save-status ${saveStatus}`} title={getSaveStatusText()} aria-live="polite">
            {saveStatus === 'unsaved' && <CircleIcon size={9} />}
            {saveStatus === 'saving' && <LoaderCircleIcon size={12} />}
            {saveStatus === 'saved' && <CheckIcon size={13} />}
            {saveStatus === 'error' && <CircleAlertIcon size={13} />}
          </span>
          <button
            className="action-btn icon-btn"
            onClick={handleUndo}
            disabled={note.format !== 'richtext' && !canUndo}
            title={`${t.undo} (${mac ? '\u2318Z' : 'Ctrl+Z'})`}
            aria-label={t.undo}
          >
            <UndoIcon />
          </button>
          <button
            className="action-btn icon-btn"
            onClick={handleRedo}
            disabled={note.format !== 'richtext' && !canRedo}
            title={`${t.redo} (${mac ? '\u2318\u21E7Z' : 'Ctrl+Y'})`}
            aria-label={t.redo}
          >
            <RedoIcon />
          </button>
          <button
            className="action-btn icon-btn"
            onClick={handleCopyToClipboard}
            title={t.copyToClipboard}
            aria-label={t.copy}
          >
            {copyFeedback ? <CheckIcon /> : <CopyIcon />}
          </button>
          {note.format === 'richtext' && (
            <button
              className="action-btn icon-btn"
              onClick={handleCopyAsMarkdown}
              title={t.copyAsMarkdown}
              aria-label={t.copyAsMarkdown}
            >
              {copyMdFeedback ? <CheckIcon /> : 'MD'}
            </button>
          )}
          {note.format === 'markdown' && (
            <button
              className={`action-btn icon-btn ${showPreview ? 'active' : ''}`}
              onClick={() => setShowPreview(!showPreview)}
              title={t.preview}
              aria-label={t.preview}
              aria-pressed={showPreview}
            >
              <PreviewIcon />
            </button>
          )}
          {note.format === 'plaintext' ? (
            <button className="action-btn save-btn" onClick={handleSave}>
              {t.save}
            </button>
          ) : (
            <div className="export-menu-container" ref={exportMenuRef}>
              <button
                className="action-btn save-btn"
                onClick={() => setShowExportMenu(!showExportMenu)}
                aria-expanded={showExportMenu}
              >
                {t.save}
              </button>
              {showExportMenu && (
                <div className="export-menu">
                  {note.format === 'richtext' ? (
                    <>
                      <button onClick={() => handleExport('native')}>{t.exportAsHtml}</button>
                      <button onClick={() => handleExport('markdown')}>{t.exportAsMarkdown}</button>
                      <button onClick={() => handleExport('rtf')}>{t.exportAsRtf}</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => handleExport('native')}>{t.exportAsMarkdown}</button>
                      <button onClick={() => handleExport('html')}>{t.exportAsHtml}</button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
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

      {note.format === 'richtext' && (
        <div className="formatting-toolbar" role="toolbar" aria-label={t.formatting} onKeyDown={handleToolbarKeyDown}>
          <div className="format-group">
            <select
              className="style-select"
              value={currentBlockStyle}
              onChange={handleBlockStyleChange}
              title={`${t.bodyText}: ${mac ? '⌘⌥0' : 'Ctrl+0'} | ${t.heading1}: ${mac ? '⌘⌥1' : 'Ctrl+1'} | ${t.heading2}: ${mac ? '⌘⌥2' : 'Ctrl+2'} | ${t.heading3}: ${mac ? '⌘⌥3' : 'Ctrl+3'}`}
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
              <BoldIcon />
            </button>
            <button
              className={`format-btn ${activeFormats.italic ? 'active' : ''}`}
              onMouseDown={preventFocusLoss}
              onClick={() => applyFormat('italic')}
              title={`${state.lang === 'no' ? 'Kursiv' : 'Italic'} (${mac ? '⌘I' : 'Ctrl+I'})`}
              aria-pressed={activeFormats.italic}
            >
              <ItalicIcon />
            </button>
            <button
              className={`format-btn ${activeFormats.underline ? 'active' : ''}`}
              onMouseDown={preventFocusLoss}
              onClick={() => applyFormat('underline')}
              title={`${state.lang === 'no' ? 'Understreking' : 'Underline'} (${mac ? '⌘U' : 'Ctrl+U'})`}
              aria-pressed={activeFormats.underline}
            >
              <UnderlineIcon />
            </button>
            <button
              className={`format-btn ${activeFormats.strikethrough ? 'active' : ''}`}
              onMouseDown={preventFocusLoss}
              onClick={() => applyFormat('strikeThrough')}
              title={`${state.lang === 'no' ? 'Gjennomstreking' : 'Strikethrough'} (${mac ? '⌘⇧X' : 'Ctrl+Shift+X'})`}
              aria-pressed={activeFormats.strikethrough}
            >
              <StrikethroughIcon />
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
            <button
              className="format-btn"
              onMouseDown={preventFocusLoss}
              onClick={() => applyFormat('formatBlock', 'blockquote')}
              title={`${state.lang === 'no' ? 'Sitat' : 'Quote'} (${mac ? '⌘⇧.' : 'Ctrl+Shift+.'})`}
            >
              <QuoteIcon />
            </button>
            <button
              className="format-btn"
              onMouseDown={preventFocusLoss}
              onClick={openLinkDialog}
              title={`${state.lang === 'no' ? 'Sett inn lenke' : 'Insert link'} (${mac ? '⌘K' : 'Ctrl+K'})`}
            >
              <LinkIcon />
            </button>
          </div>
        </div>
      )}

      {note.format === 'richtext' && bubblePos && !showLinkDialog && (
        <div
          className={`selection-bubble ${bubblePos.below ? 'below' : ''}`}
          style={{ left: bubblePos.x, top: bubblePos.y }}
          onMouseDown={preventFocusLoss}
          role="toolbar"
          aria-label={t.formatting}
        >
          <button
            className={activeFormats.bold ? 'active' : ''}
            onClick={() => applyFormat('bold')}
            title={state.lang === 'no' ? 'Fet' : 'Bold'}
            aria-pressed={activeFormats.bold}
          >
            <BoldIcon />
          </button>
          <button
            className={activeFormats.italic ? 'active' : ''}
            onClick={() => applyFormat('italic')}
            title={state.lang === 'no' ? 'Kursiv' : 'Italic'}
            aria-pressed={activeFormats.italic}
          >
            <ItalicIcon />
          </button>
          <button
            className={activeFormats.underline ? 'active' : ''}
            onClick={() => applyFormat('underline')}
            title={state.lang === 'no' ? 'Understreking' : 'Underline'}
            aria-pressed={activeFormats.underline}
          >
            <UnderlineIcon />
          </button>
          <button
            className={activeFormats.strikethrough ? 'active' : ''}
            onClick={() => applyFormat('strikeThrough')}
            title={state.lang === 'no' ? 'Gjennomstreking' : 'Strikethrough'}
            aria-pressed={activeFormats.strikethrough}
          >
            <StrikethroughIcon />
          </button>
          <button
            onClick={openLinkDialog}
            title={state.lang === 'no' ? 'Sett inn lenke' : 'Insert link'}
          >
            <LinkIcon />
          </button>
          <button
            onClick={() => applyFormat('formatBlock', 'blockquote')}
            title={state.lang === 'no' ? 'Sitat' : 'Quote'}
          >
            <QuoteIcon />
          </button>
        </div>
      )}

      {showLinkDialog && (
        <div className="link-dialog-overlay">
          <div className="link-dialog">
            <div className="link-dialog-header">
              <h3>{t.insertLink}</h3>
              <button
                className="link-dialog-close"
                onClick={() => setShowLinkDialog(false)}
                aria-label={t.cancel}
              >
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
                  onKeyDown={(e) => { if (e.key === 'Enter' && linkUrl) insertLink(); }}
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
                  onKeyDown={(e) => { if (e.key === 'Enter' && linkUrl) insertLink(); }}
                  placeholder={state.lang === 'no' ? 'Valgfritt' : 'Optional'}
                />
              </label>
            </div>
            <div className="link-dialog-actions">
              <button className="action-btn" onClick={() => setShowLinkDialog(false)}>
                {t.cancel}
              </button>
              <button className="action-btn save-btn" onClick={insertLink} disabled={!linkUrl}>
                {t.insert}
              </button>
            </div>
          </div>
        </div>
      )}

      {note.format === 'markdown' && (
        <div className="formatting-toolbar" role="toolbar" aria-label={t.formatting} onKeyDown={handleToolbarKeyDown}>
          <div className="format-group">
            <button
              className="format-btn"
              onMouseDown={preventFocusLoss}
              onClick={cycleMarkdownHeading}
              title={`${state.lang === 'no' ? 'Overskrift' : 'Heading'} (${mac ? '⌘⌥1/2/3' : 'Ctrl+1/2/3'})`}
            >
              <HeadingIcon />
            </button>
          </div>
          <div className="format-group">
            <button
              className="format-btn"
              onMouseDown={preventFocusLoss}
              onClick={() => insertMarkdown('**', '**', state.lang === 'no' ? 'fet tekst' : 'bold text')}
              title={`${state.lang === 'no' ? 'Fet' : 'Bold'} (${mac ? '⌘B' : 'Ctrl+B'})`}
            >
              <BoldIcon />
            </button>
            <button
              className="format-btn"
              onMouseDown={preventFocusLoss}
              onClick={() => insertMarkdown('*', '*', state.lang === 'no' ? 'kursiv tekst' : 'italic text')}
              title={`${state.lang === 'no' ? 'Kursiv' : 'Italic'} (${mac ? '⌘I' : 'Ctrl+I'})`}
            >
              <ItalicIcon />
            </button>
            <button
              className="format-btn"
              onMouseDown={preventFocusLoss}
              onClick={() => insertMarkdown('~~', '~~', state.lang === 'no' ? 'gjennomstreket' : 'strikethrough')}
              title={`${state.lang === 'no' ? 'Gjennomstreking' : 'Strikethrough'} (${mac ? '⌘⇧X' : 'Ctrl+Shift+X'})`}
            >
              <StrikethroughIcon />
            </button>
          </div>
          <div className="format-group">
            <button
              className="format-btn"
              onMouseDown={preventFocusLoss}
              onClick={() => insertMarkdown('`', '`', state.lang === 'no' ? 'kode' : 'code')}
              title={`${state.lang === 'no' ? 'Inline kode' : 'Inline code'} (${mac ? '⌘E' : 'Ctrl+E'})`}
            >
              <CodeIcon />
            </button>
            <button
              className="format-btn"
              onMouseDown={preventFocusLoss}
              onClick={() => insertMarkdown('```\n', '\n```', state.lang === 'no' ? 'kodeblokk' : 'code block')}
              title={`${state.lang === 'no' ? 'Kodeblokk' : 'Code block'} (${mac ? '⌘⇧E' : 'Ctrl+Shift+E'})`}
            >
              <CodeBlockIcon />
            </button>
          </div>
          <div className="format-group">
            <button
              className="format-btn"
              onMouseDown={preventFocusLoss}
              onClick={() => toggleMarkdownList('bullet')}
              title={`${state.lang === 'no' ? 'Punktliste' : 'Bullet list'} (${mac ? '⌘⇧8' : 'Ctrl+Shift+8'})`}
            >
              <BulletListIcon />
            </button>
            <button
              className="format-btn"
              onMouseDown={preventFocusLoss}
              onClick={() => toggleMarkdownList('numbered')}
              title={`${state.lang === 'no' ? 'Nummerert liste' : 'Numbered list'} (${mac ? '⌘⇧7' : 'Ctrl+Shift+7'})`}
            >
              <NumberedListIcon />
            </button>
          </div>
          <div className="format-group">
            <button
              className="format-btn"
              onMouseDown={preventFocusLoss}
              onClick={openLinkDialog}
              title={`${state.lang === 'no' ? 'Sett inn lenke' : 'Insert link'} (${mac ? '⌘K' : 'Ctrl+K'})`}
            >
              <LinkIcon />
            </button>
            <button
              className="format-btn"
              onMouseDown={preventFocusLoss}
              onClick={toggleMarkdownQuote}
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
                  {t.noTagsYet}
                </div>
              ) : (
                [...state.tags].sort((a, b) => a.name.localeCompare(b.name, state.lang)).map(tag => (
                  <button
                    key={tag.id}
                    className="tag-picker-item"
                    onClick={() => toggleNoteTag(note.id, tag.id)}
                  >
                    <span>{tag.name}</span>
                    {note.tags.includes(tag.id) && <span className="check-mark"><CheckIcon size={12} /></span>}
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
          {note.tags
            .map(tagId => state.tags.find(t => t.id === tagId))
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
          note={note}
          textareaRef={textareaRef}
          richtextRef={richtextRef}
          onApplyText={(content, cursor) => {
            updateNote(note.id, { content });
            pushState(content, cursor);
          }}
          onClose={() => setShowFind(false)}
          focusTick={findFocusTick}
        />
      )}

      <div className={`editor-container ${note.format === 'markdown' && showPreview ? 'with-preview' : ''}`}>
        <div className="editor-pane">
          {note.format === 'richtext' ? (
            <RichTextEditor
              noteId={note.id}
              initialContent={note.content}
              onContentChange={handleRichtextChange}
              onEnterCapture={captureNoteName}
              editorRef={richtextRef}
              placeholder={placeholderText}
            />
          ) : (
            <textarea
              ref={textareaRef}
              className={`editor ${note.format}`}
              placeholder={placeholderText}
              value={note.content}
              onChange={handleContentChange}
              onKeyDown={handleMarkdownKeyDown}
              spellCheck={note.format === 'plaintext' || note.format === 'markdown'}
              aria-label={placeholderText}
              dir="ltr"
            />
          )}
        </div>

        {note.format === 'markdown' && showPreview && (
          <div className="preview-pane" aria-label={t.preview}>
            <div className="markdown-preview" dir="ltr">
              <div dangerouslySetInnerHTML={{ __html: markdownPreviewHtml }} />
            </div>
          </div>
        )}
      </div>

      {(() => {
        const { words, chars } = countWordsAndChars(note.content, note.format);
        return (
          <div className="editor-footer">
            <span className="word-count">{words} {t.words}</span>
            <span className="char-count">{chars} {t.characters}</span>
            <span className="note-modified">{t.modified}: {formatDate(note.updatedAt, state.lang)}</span>
          </div>
        );
      })()}
    </div>
  );
}
