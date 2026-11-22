import { useEffect, useRef } from 'react';
import { EditorState, Compartment, Annotation, Prec } from '@codemirror/state';
import { EditorView, keymap, placeholder as placeholderExt } from '@codemirror/view';
import { history, undo, redo, undoDepth, redoDepth, standardKeymap } from '@codemirror/commands';
// Only these parts: markdown() would bundle HTML, CSS and JavaScript support
import { deleteMarkupBackward } from '@codemirror/lang-markdown';
import { skriveMarkdown } from '@/editor/obsidian';
import { markdownLens } from '@/editor/livePreview';
import { findHighlights } from '@/editor/find';
import { activeFormats, toggleInline, toggleLines, toggleCodeBlock, setHeading, linkAt, newlineInMarkdown, insertLink, type ActiveFormats } from '@/editor/commands';
import { htmlToMarkdown } from '@/utils/markdown';
import { isSafeUrl } from '@/utils/sanitize';
import { isMac } from '@/utils/helpers';
import editorCss from '@/styles/editor.css?inline';

// A change that came from outside the editor (find/replace, naming,
// restore); it must not be reported back as user input
const External = Annotation.define<boolean>();

export interface MarkdownEditorProps {
  noteId: string;
  content: string;
  // Changes when content was replaced outside the editor
  revision: number;
  source: boolean;
  placeholder: string;
  lang: 'no' | 'en';
  onChange: (content: string, noteId: string) => void;
  // Synchronous, on every change: the app's unload spill reads it
  onLiveChange: (content: string, noteId: string) => void;
  onEnter: () => boolean;
  onUpdate: (info: { formats: ActiveFormats; canUndo: boolean; canRedo: boolean }) => void;
  onLinkRequest: () => void;
  onToggleSource: () => void;
  viewRef: React.MutableRefObject<EditorView | null>;
  // False leaves the caret out, so the opening line shows formatted
  autoFocus?: boolean;
}

function contentAttributes(lang: 'no' | 'en', placeholder: string) {
  return [
    EditorView.contentAttributes.of({ spellcheck: 'true', lang: lang === 'no' ? 'nb' : 'en', 'aria-label': placeholder }),
    placeholderExt(placeholder)
  ];
}

// Pasted HTML that carries formatting becomes Markdown; anything else
// pastes as plain text
const FORMATTED_HTML = /<(h[1-6]|p|ul|ol|li|strong|b|em|i|a|blockquote|pre|table)[\s>]/i;

// The tree's tab stop is the open note's row when it is visible
function focusTreeRow(): boolean {
  const row = document.querySelector<HTMLElement>('.sidebar:not(.hidden) [role="tree"] [tabindex="0"]');
  row?.focus();
  return !!row;
}

// Tab in the tree skips to the editor, so Tab here goes on to what it
// skipped: the sidebar footer, then the toggle and toolbar, then back here
function focusAfterEditor(): boolean {
  const next = document.querySelector<HTMLElement>('.sidebar:not(.hidden) .sidebar-footer-btn') ?? document.querySelector<HTMLElement>('.sidebar-toggle');
  next?.focus();
  return !!next;
}

// The sidebar asks for the editor's focus with this event (Enter on a note)
export const FOCUS_EDITOR_EVENT = 'skrive:focus-editor';

// A note opened under a modal dialog waits for it to close, then takes
// focus only if nothing else did (the trash returns it to its button).
// A note opened from the tree leaves focus there, so the arrow keys go on
function focusUnlessModal(view: EditorView) {
  if (document.activeElement?.closest('[role="tree"]')) return;
  if (!document.querySelector('[aria-modal="true"]')) {
    view.focus();
    return;
  }
  const observer = new MutationObserver(() => {
    if (document.querySelector('[aria-modal="true"]')) return;
    observer.disconnect();
    if (view.dom.isConnected && (!document.activeElement || document.activeElement === document.body)) view.focus();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

export function MarkdownEditor(props: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  // Changes reach React after the input event: inside it they get sync
  // priority and chain into React's nested-update limit while typing fast.
  // The note id travels along, since the user may switch notes meanwhile
  const pendingRef = useRef<{ doc: string; noteId: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushPending = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) propsRef.current.onChange(pending.doc, pending.noteId);
  };
  const lensRef = useRef(new Compartment());
  const contentAttrsRef = useRef(new Compartment());
  // The note the view holds; the mount already loaded the first one
  const viewNoteRef = useRef(props.noteId);
  const reportState = (state: EditorState) => propsRef.current.onUpdate({
    formats: activeFormats(state),
    canUndo: undoDepth(state) > 0,
    canRedo: redoDepth(state) > 0
  });

  const createState = (doc: string) => {
    const p = propsRef.current;
    return EditorState.create({
      doc,
      extensions: [
        // Naming flow and shortcuts first: they must win over list continuation
        Prec.highest(keymap.of([{ key: 'Enter', run: () => propsRef.current.onEnter() }])),
        Prec.highest(EditorView.domEventHandlers({ keydown: (e, view) => handleShortcut(e, view) })),
        history(),
        keymap.of([
          { key: 'Enter', run: newlineInMarkdown },
          { key: 'Backspace', run: deleteMarkupBackward },
          // Back to the note's row in the tree; Tab there comes back here
          { key: 'Shift-Tab', run: focusTreeRow },
          { key: 'Tab', run: focusAfterEditor },
          ...standardKeymap
        ]),
        skriveMarkdown.extension,
        lensRef.current.of(markdownLens(p.source)),
        contentAttrsRef.current.of(contentAttributes(p.lang, p.placeholder)),
        findHighlights,
        EditorView.lineWrapping,
        EditorView.domEventHandlers({
          paste: (e, view) => {
            const html = e.clipboardData?.getData('text/html') ?? '';
            const text = e.clipboardData?.getData('text/plain').trim() ?? '';
            const sel = view.state.selection.main;
            // A URL pasted over a selection links it
            if (!sel.empty && /^https?:\/\/\S+$/.test(text) && isSafeUrl(text)) {
              e.preventDefault();
              insertLink(view, text, view.state.sliceDoc(sel.from, sel.to), sel);
              return true;
            }
            if (html && FORMATTED_HTML.test(html)) {
              e.preventDefault();
              view.dispatch(view.state.replaceSelection(htmlToMarkdown(html)));
              return true;
            }
            return false;
          },
          mousedown: (e, view) => {
            if (!(e.metaKey || e.ctrlKey)) return false;
            const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
            const url = pos === null ? null : linkAt(view.state, pos);
            if (!url || !isSafeUrl(url) || !/^(https?:|mailto:)/i.test(url)) return false;
            e.preventDefault();
            window.open(url, '_blank', 'noopener,noreferrer');
            return true;
          }
        }),
        EditorView.updateListener.of(update => {
          if (update.docChanged && !update.transactions.some(tr => tr.annotation(External))) {
            const doc = update.state.doc.toString();
            pendingRef.current = { doc, noteId: propsRef.current.noteId };
            propsRef.current.onLiveChange(doc, propsRef.current.noteId);
            if (!timerRef.current) timerRef.current = setTimeout(flushPending, 0);
          }
          if (update.docChanged || update.selectionSet) reportState(update.state);
        })
      ]
    });
  };

  // Mount once into a shadow root: CodeMirror injects its styles, and only
  // adoptedStyleSheets there pass a CSP without 'unsafe-inline' for styles
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(editorCss);
    shadow.adoptedStyleSheets = [sheet];
    const view = new EditorView({ state: createState(propsRef.current.content), parent: shadow, root: shadow });
    props.viewRef.current = view;
    // setState and a new view call no update listener
    reportState(view.state);
    if (propsRef.current.autoFocus !== false) focusUnlessModal(view);
    const focus = () => view.focus();
    window.addEventListener(FOCUS_EDITOR_EVENT, focus);
    return () => {
      window.removeEventListener(FOCUS_EDITOR_EVENT, focus);
      flushPending();
      view.destroy();
      props.viewRef.current = null;
    };
    // Mounted once; later prop changes are applied by the effects below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A different note gets a fresh state, so undo never crosses notes
  useEffect(() => {
    const view = props.viewRef.current;
    if (!view || viewNoteRef.current === props.noteId) return;
    viewNoteRef.current = props.noteId;
    flushPending();
    view.setState(createState(propsRef.current.content));
    reportState(view.state);
    focusUnlessModal(view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.noteId]);

  // Content replaced outside the editor. Only on a new revision: comparing
  // content would take a stale render's text for an outside edit
  useEffect(() => {
    const view = props.viewRef.current;
    if (!view || view.state.doc.toString() === propsRef.current.content) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: propsRef.current.content },
      annotations: External.of(true)
    });
  }, [props.revision, props.viewRef]);

  useEffect(() => {
    props.viewRef.current?.dispatch({ effects: lensRef.current.reconfigure(markdownLens(props.source)) });
  }, [props.source, props.viewRef]);

  useEffect(() => {
    props.viewRef.current?.dispatch({ effects: contentAttrsRef.current.reconfigure(contentAttributes(props.lang, props.placeholder)) });
  }, [props.lang, props.placeholder, props.viewRef]);

  // e.code, not e.key: with Shift or Alt held, e.key is the shifted
  // character and differs between keyboard layouts
  function handleShortcut(e: KeyboardEvent, view: EditorView): boolean {
    const mac = isMac();
    const mod = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
    if (!mod) return false;
    const p = propsRef.current;
    const run = (done: boolean) => {
      if (done) e.preventDefault();
      return done;
    };

    // Headings: Cmd+Opt+digit on Mac only; on Windows Ctrl+digit belongs to
    // the browser's tabs and zoom, and Ctrl+Alt is AltGr
    if (mac && e.altKey && !e.shiftKey) {
      const level = ({ Digit0: 0, Digit1: 1, Digit2: 2, Digit3: 3 } as Record<string, number>)[e.code];
      return level === undefined ? false : run(setHeading(view, level));
    }
    if (e.altKey) return false;

    if (!e.shiftKey) {
      switch (e.code) {
        case 'KeyB': return run(toggleInline(view, 'bold'));
        case 'KeyI': return run(toggleInline(view, 'italic'));
        case 'KeyE': return run(toggleInline(view, 'code'));
        case 'KeyK': p.onLinkRequest(); return run(true);
        case 'KeyZ': return run(undo(view) || true);
        case 'KeyY': return mac ? false : run(redo(view) || true);
        case 'Period': p.onToggleSource(); return run(true);
      }
      return false;
    }
    switch (e.code) {
      case 'KeyX': return run(toggleInline(view, 'strike'));
      case 'KeyE': return run(toggleCodeBlock(view));
      case 'KeyZ': return run(redo(view) || true);
      case 'Digit8': return run(toggleLines(view, 'bullet'));
      case 'Digit7': return run(toggleLines(view, 'ordered'));
      case 'Digit9': return run(toggleLines(view, 'task'));
      case 'Period': return run(toggleLines(view, 'quote'));
    }
    return false;
  }

  return <div ref={hostRef} className="markdown-editor-host" />;
}
