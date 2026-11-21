import { EditorSelection, type ChangeSpec, type EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { insertNewlineContinueMarkup } from '@codemirror/lang-markdown';
import { encodeLinkTarget } from '@/utils/markdown';

export type InlineStyle = 'bold' | 'italic' | 'strike' | 'code';
export type LineStyle = 'bullet' | 'ordered' | 'task' | 'quote';

const INLINE: Record<InlineStyle, { node: string; mark: string; markNode: string }> = {
  bold: { node: 'StrongEmphasis', mark: '**', markNode: 'EmphasisMark' },
  italic: { node: 'Emphasis', mark: '*', markNode: 'EmphasisMark' },
  strike: { node: 'Strikethrough', mark: '~~', markNode: 'StrikethroughMark' },
  code: { node: 'InlineCode', mark: '`', markNode: 'CodeMark' }
};

export interface ActiveFormats {
  bold: boolean;
  italic: boolean;
  code: boolean;
  heading: number;
  list: LineStyle | null;
}

function enclosing(state: EditorState, pos: number, name: string) {
  for (let node: ReturnType<typeof syntaxTree>['topNode'] | null = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent) {
    if (node.name === name) return node;
  }
  for (let node: ReturnType<typeof syntaxTree>['topNode'] | null = syntaxTree(state).resolveInner(pos, 1); node; node = node.parent) {
    if (node.name === name) return node;
  }
  return null;
}

export function activeFormats(state: EditorState): ActiveFormats {
  const pos = state.selection.main.head;
  const l = state.doc.lineAt(pos).text;
  const heading = /^(#{1,6})\s/.exec(l);
  const list: LineStyle | null = /^\s*[-*+]\s\[[ xX]\]\s/.test(l) ? 'task'
    : /^\s*[-*+]\s/.test(l) ? 'bullet'
    : /^\s*\d+[.)]\s/.test(l) ? 'ordered'
    : /^\s*>/.test(l) ? 'quote' : null;
  return {
    bold: !!enclosing(state, pos, 'StrongEmphasis'),
    italic: !!enclosing(state, pos, 'Emphasis'),
    code: !!enclosing(state, pos, 'InlineCode'),
    heading: heading ? heading[1].length : 0,
    list
  };
}

// Inside a styled span the marks are removed; otherwise the selection is
// wrapped, or empty marks are inserted with the caret between them
export function toggleInline(view: EditorView, style: InlineStyle): boolean {
  const { node: nodeName, mark, markNode } = INLINE[style];
  const { state } = view;
  view.dispatch(state.changeByRange(range => {
    const node = enclosing(state, range.from, nodeName);
    if (node && node.from <= range.from && node.to >= range.to) {
      const marks = node.getChildren(markNode);
      const changes = marks.map(m => ({ from: m.from, to: m.to }));
      const removedBefore = (pos: number) => marks.filter(m => m.to <= pos).reduce((n, m) => n + m.to - m.from, 0);
      return {
        changes,
        range: EditorSelection.range(range.anchor - removedBefore(range.anchor), range.head - removedBefore(range.head))
      };
    }
    // Marks must hug the text: trailing spaces stay outside
    const selected = state.sliceDoc(range.from, range.to);
    const trimmedEnd = range.from + selected.trimEnd().length;
    return {
      changes: [{ from: range.from, insert: mark }, { from: trimmedEnd, insert: mark }],
      range: range.empty
        ? EditorSelection.cursor(range.from + mark.length)
        : EditorSelection.range(range.from + mark.length, trimmedEnd + mark.length)
    };
  }));
  return true;
}

function selectedLines(state: EditorState) {
  const lines = new Map<number, { from: number; text: string }>();
  for (const r of state.selection.ranges) {
    for (let n = state.doc.lineAt(r.from).number; n <= state.doc.lineAt(r.to).number; n++) {
      const l = state.doc.line(n);
      lines.set(l.number, { from: l.from, text: l.text });
    }
  }
  return [...lines.values()];
}

// Body text (0) or heading level 1-3 for every selected line
// Line prefixes go in front of the cursor: a cursor at the start of the
// line (or inside the old prefix) lands after the new one, not before it
function replacePrefixes(view: EditorView, changes: ChangeSpec[]): void {
  const set = view.state.changes(changes);
  view.dispatch({ changes: set, selection: view.state.selection.map(set, 1) });
}

export function setHeading(view: EditorView, level: number): boolean {
  const changes = selectedLines(view.state).map(l => {
    const existing = /^#{1,6}\s+/.exec(l.text);
    return { from: l.from, to: l.from + (existing ? existing[0].length : 0), insert: level ? '#'.repeat(level) + ' ' : '' };
  });
  replacePrefixes(view, changes);
  return true;
}

const PREFIX = /^(\s*)(?:[-*+]\s\[[ xX]\]\s|[-*+]\s|\d+[.)]\s|>\s?)?/;

// Adds the line style to every selected line, or removes it when all of
// them already have it; one list type replaces another
export function toggleLines(view: EditorView, style: LineStyle): boolean {
  const lines = selectedLines(view.state);
  const all = lines.every(l => {
    const t = l.text.trimStart();
    return style === 'task' ? /^[-*+]\s\[[ xX]\]\s/.test(t)
      : style === 'bullet' ? /^[-*+]\s/.test(t) && !/^[-*+]\s\[[ xX]\]\s/.test(t)
      : style === 'ordered' ? /^\d+[.)]\s/.test(t)
      : t.startsWith('>');
  });
  const changes = lines.map((l, i) => {
    const [whole, indent] = PREFIX.exec(l.text)!;
    const prefix = all ? ''
      : style === 'bullet' ? '- '
      : style === 'task' ? '- [ ] '
      : style === 'ordered' ? `${i + 1}. `
      : '> ';
    return { from: l.from + indent.length, to: l.from + whole.length, insert: prefix };
  });
  replacePrefixes(view, changes);
  return true;
}

export function toggleCodeBlock(view: EditorView): boolean {
  const { state } = view;
  const block = enclosing(state, state.selection.main.head, 'FencedCode');
  if (block) {
    const first = state.doc.lineAt(block.from);
    const closing = block.lastChild?.name === 'CodeMark' && block.lastChild.from > first.to ? block.lastChild : null;
    // An unclosed block has no fence to remove at its end, only its code
    if (!closing) {
      view.dispatch({ changes: { from: first.from, to: Math.min(first.to + 1, state.doc.length) } });
      return true;
    }
    const last = state.doc.lineAt(closing.from);
    if (last.number - first.number < 2) {
      view.dispatch({ changes: { from: first.from, to: last.to } });
      return true;
    }
    view.dispatch({ changes: [
      { from: last.from > first.from ? last.from - 1 : last.from, to: last.to },
      { from: first.from, to: Math.min(first.to + 1, state.doc.length) }
    ] });
    return true;
  }
  const lines = selectedLines(state);
  const from = lines[0].from;
  const lastLine = lines[lines.length - 1];
  const to = lastLine.from + lastLine.text.length;
  view.dispatch({
    changes: [{ from, insert: '```\n' }, { from: to, insert: '\n```' }],
    selection: EditorSelection.cursor(from + 4)
  });
  return true;
}

export function insertLink(view: EditorView, url: string, text: string, at: { from: number; to: number }): void {
  const label = text || url;
  const link = `[${label}](${encodeLinkTarget(url)})`;
  view.dispatch({
    changes: { from: at.from, to: at.to, insert: link },
    selection: EditorSelection.cursor(at.from + link.length)
  });
  view.focus();
}

// The link URL at a document position, for Cmd/Ctrl+click
export function linkAt(state: EditorState, pos: number): string | null {
  const link = enclosing(state, pos, 'Link');
  const url = link ? link.getChild('URL') : enclosing(state, pos, 'URL');
  return url ? state.sliceDoc(url.from, url.to) : null;
}

// Enter on an empty top-level item leaves the list with a blank line, so
// the next text is a new paragraph and not part of the last item
export function newlineInMarkdown(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  const line = state.doc.lineAt(sel.head);
  if (sel.empty && sel.head === line.to && /^(?:[-*+]|\d+[.)])(?: \[[ xX]\])?\s*$/.test(line.text)) {
    view.dispatch({ changes: { from: line.from, to: line.to, insert: '\n' }, selection: { anchor: line.from + 1 } });
    return true;
  }
  return insertNewlineContinueMarkup(view);
}
