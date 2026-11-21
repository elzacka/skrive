import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import type { Range } from '@codemirror/state';

// Both lenses style the same Markdown text. The formatted lens hides marks
// unless the selection touches them; the Markdown lens shows them dimmed

class BulletWidget extends WidgetType {
  eq() { return true; }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-md-bullet';
    span.textContent = '•';
    return span;
  }
}

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean, readonly pos: number) { super(); }
  eq(other: CheckboxWidget) { return other.checked === this.checked && other.pos === this.pos; }
  toDOM(view: EditorView) {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'cm-md-task';
    box.checked = this.checked;
    box.tabIndex = -1;
    box.addEventListener('mousedown', (e) => {
      e.preventDefault();
      view.dispatch({ changes: { from: this.pos + 1, to: this.pos + 2, insert: this.checked ? ' ' : 'x' } });
    });
    return box;
  }
  ignoreEvent() { return true; }
}

const hide = Decoration.replace({});
const bullet = Decoration.replace({ widget: new BulletWidget() });
const mark = (cls: string) => Decoration.mark({ class: cls });
const line = (cls: string) => Decoration.line({ class: cls });

const INLINE_CLASS: Record<string, string> = {
  StrongEmphasis: 'cm-md-strong',
  Emphasis: 'cm-md-em',
  Strikethrough: 'cm-md-strike',
  InlineCode: 'cm-md-code',
  Link: 'cm-md-link',
  Image: 'cm-md-link',
  URL: 'cm-md-link'
};

const MARK_NODES = new Set(['HeaderMark', 'QuoteMark', 'ListMark', 'EmphasisMark', 'CodeMark',
  'CodeInfo', 'LinkMark', 'StrikethroughMark', 'TaskMarker', 'TableDelimiter']);

function build(view: EditorView, source: boolean): DecorationSet {
  const { state } = view;
  const ranges: Range<Decoration>[] = [];
  const focused = view.hasFocus;
  const touches = (from: number, to: number) =>
    focused && state.selection.ranges.some(r => r.from <= to && r.to >= from);
  const lineAt = (pos: number) => state.doc.lineAt(pos);
  const eachLine = (from: number, to: number, cls: string) => {
    for (let n = lineAt(from).number; n <= lineAt(to).number; n++) {
      ranges.push(line(cls).range(state.doc.line(n).from));
    }
  };

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from, to,
      enter: (node) => {
        const { name } = node;

        if (source) {
          if (MARK_NODES.has(name)) ranges.push(mark('cm-md-mark').range(node.from, node.to));
          return;
        }

        const heading = /^ATXHeading(\d)$/.exec(name);
        if (heading) {
          const l = lineAt(node.from);
          ranges.push(line(`cm-md-h${heading[1]}`).range(l.from));
          const headerMark = node.node.getChild('HeaderMark');
          if (headerMark && !touches(l.from, l.to)) {
            const end = state.doc.sliceString(headerMark.to, headerMark.to + 1) === ' ' ? headerMark.to + 1 : headerMark.to;
            if (end > headerMark.from) ranges.push(hide.range(headerMark.from, end));
          }
          return;
        }

        if (name in INLINE_CLASS) {
          if (name === 'URL' && node.node.parent?.name === 'Link') return;
          if (node.to > node.from) ranges.push(mark(INLINE_CLASS[name]).range(node.from, node.to));
          if (touches(node.from, node.to)) return;
          if (name === 'Link' || name === 'Image') {
            const marks = node.node.getChildren('LinkMark');
            if (marks.length >= 2) {
              ranges.push(hide.range(node.from, marks[0].to));
              ranges.push(hide.range(marks[1].from, node.to));
            }
            return false;
          }
          for (const child of node.node.getChildren(name === 'InlineCode' ? 'CodeMark' : name === 'Strikethrough' ? 'StrikethroughMark' : 'EmphasisMark')) {
            ranges.push(hide.range(child.from, child.to));
          }
          return;
        }

        switch (name) {
          case 'Blockquote':
            eachLine(node.from, node.to, 'cm-md-quote');
            return;
          case 'QuoteMark': {
            const l = lineAt(node.from);
            if (!touches(l.from, l.to)) {
              const end = state.doc.sliceString(node.to, node.to + 1) === ' ' ? node.to + 1 : node.to;
              ranges.push(hide.range(node.from, end));
            }
            return;
          }
          case 'ListMark': {
            const text = state.doc.sliceString(node.from, node.to);
            const isTask = node.node.nextSibling?.name === 'Task';
            if (/^[-*+]$/.test(text) && !touches(node.from, node.to + 1)) {
              // A task's checkbox stands in for its bullet
              ranges.push(isTask ? hide.range(node.from, node.to + 1) : bullet.range(node.from, node.to));
            } else {
              ranges.push(mark('cm-md-listmark').range(node.from, node.to));
            }
            return;
          }
          case 'TaskMarker': {
            const checked = /x/i.test(state.doc.sliceString(node.from, node.to));
            const l = lineAt(node.from);
            const textStart = node.to + (/^\s*/.exec(state.doc.sliceString(node.to, l.to))?.[0].length ?? 0);
            if (checked && l.to > textStart) ranges.push(mark('cm-md-done').range(textStart, l.to));
            if (!touches(node.from, node.to)) {
              ranges.push(Decoration.replace({ widget: new CheckboxWidget(checked, node.from) }).range(node.from, node.to));
            }
            return;
          }
          case 'FencedCode':
          case 'CodeBlock':
            eachLine(node.from, node.to, 'cm-md-codeblock');
            return;
          case 'CodeMark':
          case 'CodeInfo':
            if (node.node.parent?.name === 'FencedCode') ranges.push(mark('cm-md-mark').range(node.from, node.to));
            return;
          case 'HorizontalRule':
            ranges.push(mark('cm-md-mark').range(node.from, node.to));
            return;
          case 'Table':
            eachLine(node.from, node.to, 'cm-md-table');
            return;
          case 'Escape':
            if (!touches(node.from, node.to)) ranges.push(hide.range(node.from, node.from + 1));
            return;
        }
      }
    });
  }
  return Decoration.set(ranges, true);
}

export function markdownLens(source: boolean) {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view, source);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet || update.focusChanged ||
          syntaxTree(update.startState) !== syntaxTree(update.state)) {
        this.decorations = build(update.view, source);
      }
    }
  }, { decorations: v => v.decorations });
}
