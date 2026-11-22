import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { StateField, type EditorState, type Extension, type Range } from '@codemirror/state';
import katex from 'katex';
import { markdownToHtml } from '@/utils/markdown';

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

// A table shows as a table until the selection enters it
class TableWidget extends WidgetType {
  constructor(readonly source: string, readonly from: number) { super(); }
  eq(other: TableWidget) { return other.source === this.source && other.from === this.from; }
  toDOM(view: EditorView) {
    const wrap = document.createElement('div');
    wrap.className = 'cm-md-tablewidget';
    // markdownToHtml() output is sanitized
    wrap.innerHTML = markdownToHtml(this.source);
    wrap.addEventListener('mousedown', (e) => {
      e.preventDefault();
      view.dispatch({ selection: { anchor: this.from } });
      view.focus();
    });
    // A link here would navigate the app window away
    wrap.addEventListener('click', (e) => e.preventDefault());
    return wrap;
  }
  ignoreEvent() { return true; }
}

// Top-level tables, and paragraphs that are one $$ formula: both span
// lines, so they render as blocks until the selection enters them
function blockDecorations(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const touched = (from: number, to: number) => state.selection.ranges.some(r => r.from <= to && r.to >= from);
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === 'Document') return true;
      const from = state.doc.lineAt(node.from).from;
      const to = state.doc.lineAt(node.to).to;
      if (node.name === 'Table' && !touched(from, to)) {
        ranges.push(Decoration.replace({ widget: new TableWidget(state.sliceDoc(from, to), from), block: true }).range(from, to));
      }
      const math = node.node.firstChild;
      if (node.name === 'Paragraph' && math?.name === 'InlineMath' && math.from === node.from && math.to === node.to &&
          state.sliceDoc(node.from, node.from + 2) === '$$' && !touched(from, to)) {
        const { tex } = mathSource(state, node.from, node.to);
        ranges.push(Decoration.replace({ widget: new MathWidget(tex, true, node.from), block: true }).range(from, to));
      }
      return false;
    }
  });
  return Decoration.set(ranges);
}

// Block widgets that replace line breaks must come from a state field
const blocks = StateField.define<DecorationSet>({
  create: blockDecorations,
  update: (decorations, tr) =>
    tr.docChanged || tr.selection || syntaxTree(tr.startState) !== syntaxTree(tr.state) ? blockDecorations(tr.state) : decorations,
  provide: field => EditorView.decorations.from(field)
});

// render() sets KaTeX's styles through the CSSOM, which the CSP allows;
// renderToString() would need style attributes, which it blocks
class MathWidget extends WidgetType {
  constructor(readonly tex: string, readonly display: boolean, readonly from: number) { super(); }
  eq(other: MathWidget) { return other.tex === this.tex && other.display === this.display && other.from === this.from; }
  toDOM(view: EditorView) {
    const el = document.createElement(this.display ? 'div' : 'span');
    el.className = 'cm-md-mathwidget';
    katex.render(this.tex, el, { displayMode: this.display, throwOnError: false, strict: 'ignore' });
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      view.dispatch({ selection: { anchor: this.from } });
      view.focus();
    });
    return el;
  }
  ignoreEvent() { return true; }
}

function mathSource(state: EditorState, from: number, to: number) {
  const width = state.sliceDoc(from, from + 2) === '$$' ? 2 : 1;
  return { tex: state.sliceDoc(from + width, to - width).trim(), display: width === 2 };
}

class HrWidget extends WidgetType {
  eq() { return true; }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-md-hr';
    return span;
  }
}

// A callout without a title shows its type, as Obsidian does
class LabelWidget extends WidgetType {
  constructor(readonly label: string) { super(); }
  eq(other: LabelWidget) { return other.label === this.label; }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-md-callout-title';
    span.textContent = this.label;
    return span;
  }
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

// Inline HTML that Obsidian renders; the tags hide like Markdown marks
const HTML_CLASS: Record<string, string> = {
  u: 'cm-md-underline', kbd: 'cm-md-kbd', sup: 'cm-md-sup', sub: 'cm-md-sub', mark: 'cm-md-highlight',
  b: 'cm-md-strong', strong: 'cm-md-strong', i: 'cm-md-em', em: 'cm-md-em', s: 'cm-md-strike', del: 'cm-md-strike'
};

const MARK_NODES = new Set(['HeaderMark', 'QuoteMark', 'ListMark', 'EmphasisMark', 'CodeMark',
  'CodeInfo', 'LinkMark', 'StrikethroughMark', 'TaskMarker', 'TableDelimiter', 'HighlightMark', 'WikiMark',
  'FootnoteMark', 'CalloutMark', 'FrontmatterMark', 'MathMark', 'ObsidianComment', 'LinkReference']);

function build(view: EditorView, source: boolean): DecorationSet {
  const { state } = view;
  const ranges: Range<Decoration>[] = [];
  const focused = view.hasFocus;
  // Closing HTML tags already paired with their opening tag
  const pairedClosers = new Set<number>();
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

        // Text lines, then a === or --- line, which stays visible but dim
        const setext = /^SetextHeading(\d)$/.exec(name);
        if (setext) {
          const underline = node.node.getChild('HeaderMark');
          if (underline) {
            eachLine(node.from, underline.from - 1, `cm-md-h${setext[1]}`);
            ranges.push(mark('cm-md-mark').range(underline.from, underline.to));
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
            eachLine(node.from, node.to, node.node.getChild('Paragraph')?.firstChild?.name === 'CalloutMark' ? 'cm-md-callout' : 'cm-md-quote');
            return;
          case 'CalloutMark': {
            const l = lineAt(node.from);
            const title = state.doc.sliceString(node.to, l.to).trim();
            if (touches(l.from, l.to)) {
              ranges.push(mark('cm-md-mark').range(node.from, node.to));
            } else if (title) {
              const end = state.doc.sliceString(node.to, node.to + 1) === ' ' ? node.to + 1 : node.to;
              ranges.push(hide.range(node.from, end));
              if (l.to > end) ranges.push(mark('cm-md-callout-title').range(end, l.to));
            } else {
              const type = /\[!([\w-]+)/.exec(state.doc.sliceString(node.from, node.to))?.[1] ?? '';
              ranges.push(Decoration.replace({ widget: new LabelWidget(type.charAt(0).toUpperCase() + type.slice(1)) }).range(node.from, node.to));
            }
            return;
          }
          case 'Frontmatter':
            eachLine(node.from, node.to, 'cm-md-frontmatter');
            return false;
          case 'Highlight':
            ranges.push(mark('cm-md-highlight').range(node.from, node.to));
            if (!touches(node.from, node.to)) {
              for (const child of node.node.getChildren('HighlightMark')) ranges.push(hide.range(child.from, child.to));
            }
            return;
          case 'WikiLink': {
            const shown = node.node.getChild('WikiAlias') ?? node.node.getChild('WikiTarget');
            if (!shown) return false;
            ranges.push(mark('cm-md-link').range(shown.from, shown.to));
            if (!touches(node.from, node.to)) {
              ranges.push(hide.range(node.from, shown.from));
              ranges.push(hide.range(shown.to, node.to));
            }
            return false;
          }
          case 'FootnoteRef': {
            const label = node.node.getChild('FootnoteLabel');
            const definition = lineAt(node.from).from === node.from && state.doc.sliceString(node.to, node.to + 1) === ':';
            if (definition || !label) {
              ranges.push(mark('cm-md-mark').range(node.from, node.to + (definition ? 1 : 0)));
            } else {
              ranges.push(mark('cm-md-footnote').range(label.from, label.to));
              if (!touches(node.from, node.to)) {
                ranges.push(hide.range(node.from, label.from));
                ranges.push(hide.range(label.to, node.to));
              }
            }
            return false;
          }
          // Reference definitions are not shown by Obsidian; a one-word
          // footnote definition parses as one too
          case 'LinkReference': {
            const footnote = /^\[\^[^\]]+\]:/.exec(state.doc.sliceString(node.from, node.to));
            ranges.push(mark('cm-md-mark').range(node.from, footnote ? node.from + footnote[0].length : node.to));
            return false;
          }
          case 'ObsidianComment':
            ranges.push(mark('cm-md-comment').range(node.from, node.to));
            return false;
          case 'Tag':
            ranges.push(mark('cm-md-tag').range(node.from, node.to));
            return false;
          // A $$ paragraph is the state field's; a formula across lines
          // inside other text stays source, since a plugin cannot replace
          // line breaks
          case 'InlineMath': {
            const { tex, display } = mathSource(state, node.from, node.to);
            const parent = node.node.parent;
            if (display && parent?.name === 'Paragraph' && parent.from === node.from && parent.to === node.to) return false;
            if (touches(node.from, node.to) || tex.includes('\n') || !tex) {
              ranges.push(mark('cm-md-math').range(node.from, node.to));
            } else {
              ranges.push(Decoration.replace({ widget: new MathWidget(tex, display, node.from) }).range(node.from, node.to));
            }
            return false;
          }
          case 'Autolink':
            if (!touches(node.from, node.to)) {
              for (const child of node.node.getChildren('LinkMark')) ranges.push(hide.range(child.from, child.to));
            }
            return;
          case 'HTMLTag': {
            if (pairedClosers.has(node.from)) return;
            const tag = /^<([a-z]+)>$/i.exec(state.doc.sliceString(node.from, node.to))?.[1].toLowerCase();
            for (let sib = node.node.nextSibling; tag && HTML_CLASS[tag] && sib; sib = sib.nextSibling) {
              if (sib.name !== 'HTMLTag' || state.doc.sliceString(sib.from, sib.to).toLowerCase() !== `</${tag}>`) continue;
              pairedClosers.add(sib.from);
              if (sib.from > node.to) ranges.push(mark(HTML_CLASS[tag]).range(node.to, sib.from));
              const tagMark = touches(node.from, sib.to) ? mark('cm-md-mark') : hide;
              ranges.push(tagMark.range(node.from, node.to), tagMark.range(sib.from, sib.to));
              return;
            }
            ranges.push(mark('cm-md-mark').range(node.from, node.to));
            return;
          }
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
            ranges.push(touches(node.from, node.to)
              ? mark('cm-md-mark').range(node.from, node.to)
              : Decoration.replace({ widget: new HrWidget() }).range(node.from, node.to));
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

export function markdownLens(source: boolean): Extension {
  const plugin = ViewPlugin.fromClass(class {
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
  return source ? plugin : [plugin, blocks];
}
