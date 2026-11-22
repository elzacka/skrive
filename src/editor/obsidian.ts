import { Language } from '@codemirror/language';
import { markdownLanguage } from '@codemirror/lang-markdown';
import type { BlockContext, InlineContext, Line, MarkdownConfig, MarkdownParser } from '@lezer/markdown';

// Obsidian syntax on top of GFM, so notes and files written there show
// the same here: properties, highlights, wikilinks, footnotes, callouts,
// comments, tags and math (shown as source; rendering it needs KaTeX)

const HighlightDelim = { resolve: 'Highlight', mark: 'HighlightMark' };
const space = (s: string) => /\s|^$/.test(s);

const Highlight: MarkdownConfig = {
  defineNodes: ['Highlight', 'HighlightMark'],
  parseInline: [{
    name: 'Highlight',
    parse(cx: InlineContext, next: number, pos: number) {
      if (next !== 61 || cx.char(pos + 1) !== 61 || cx.char(pos + 2) === 61) return -1;
      return cx.addDelimiter(HighlightDelim, pos, pos + 2, !space(cx.slice(pos + 2, pos + 3)), !space(cx.slice(pos - 1, pos)));
    },
    after: 'Emphasis'
  }]
};

// [[target]], [[target|alias]] and embeds ![[target]]
const WikiLink: MarkdownConfig = {
  defineNodes: ['WikiLink', 'WikiMark', 'WikiTarget', 'WikiAlias'],
  parseInline: [{
    name: 'WikiLink',
    parse(cx: InlineContext, next: number, pos: number) {
      const embed = next === 33;
      const open = pos + (embed ? 1 : 0);
      if (cx.char(open) !== 91 || cx.char(open + 1) !== 91) return -1;
      const start = open + 2;
      const close = cx.slice(start, cx.end).indexOf(']]');
      if (close <= 0) return -1;
      const inner = cx.slice(start, start + close);
      if (/[[\]\n]/.test(inner)) return -1;
      const end = start + close;
      const bar = inner.indexOf('|');
      const children = [cx.elt('WikiMark', pos, start)];
      if (bar < 0) {
        children.push(cx.elt('WikiTarget', start, end));
      } else {
        children.push(cx.elt('WikiTarget', start, start + bar), cx.elt('WikiMark', start + bar, start + bar + 1), cx.elt('WikiAlias', start + bar + 1, end));
      }
      children.push(cx.elt('WikiMark', end, end + 2));
      return cx.addElement(cx.elt('WikiLink', pos, end + 2, children));
    },
    before: 'Link'
  }]
};

// [^label]; a definition is the same at the start of a line, before ":"
const Footnote: MarkdownConfig = {
  defineNodes: ['FootnoteRef', 'FootnoteMark', 'FootnoteLabel'],
  parseInline: [{
    name: 'Footnote',
    parse(cx: InlineContext, next: number, pos: number) {
      if (next !== 91 || cx.char(pos + 1) !== 94) return -1;
      const m = /^\[\^([^\]\s]+)\]/.exec(cx.slice(pos, Math.min(cx.end, pos + 200)));
      if (!m) return -1;
      const end = pos + m[0].length;
      return cx.addElement(cx.elt('FootnoteRef', pos, end, [
        cx.elt('FootnoteMark', pos, pos + 2), cx.elt('FootnoteLabel', pos + 2, end - 1), cx.elt('FootnoteMark', end - 1, end)
      ]));
    },
    before: 'Link'
  }]
};

// > [!type]+ Title: the marker opens a quote's first paragraph
const Callout: MarkdownConfig = {
  defineNodes: ['CalloutMark'],
  parseInline: [{
    name: 'Callout',
    parse(cx: InlineContext, next: number, pos: number) {
      if (next !== 91 || cx.char(pos + 1) !== 33 || pos !== cx.offset) return -1;
      const m = /^\[![\w-]+\][+-]?/.exec(cx.slice(pos, Math.min(cx.end, pos + 60)));
      return m ? cx.addElement(cx.elt('CalloutMark', pos, pos + m[0].length)) : -1;
    },
    before: 'Link'
  }]
};

const CommentSyntax: MarkdownConfig = {
  defineNodes: ['ObsidianComment'],
  parseInline: [{
    name: 'ObsidianComment',
    parse(cx: InlineContext, next: number, pos: number) {
      if (next !== 37 || cx.char(pos + 1) !== 37) return -1;
      const close = cx.slice(pos + 2, cx.end).indexOf('%%');
      return close < 0 ? -1 : cx.addElement(cx.elt('ObsidianComment', pos, pos + 2 + close + 2));
    }
  }]
};

// #tag after a space or line start; digits alone are no tag
const Tag: MarkdownConfig = {
  defineNodes: ['Tag'],
  parseInline: [{
    name: 'Tag',
    parse(cx: InlineContext, next: number, pos: number) {
      if (next !== 35 || !space(cx.slice(pos - 1, pos))) return -1;
      const m = /^#[\p{L}\p{N}_/-]+/u.exec(cx.slice(pos, Math.min(cx.end, pos + 100)));
      return m && !/^#\d+$/.test(m[0]) ? cx.addElement(cx.elt('Tag', pos, pos + m[0].length)) : -1;
    }
  }]
};

// $inline$ and $$display$$, Obsidian's rules: no space inside the
// dollars, and no digit right after the closing one ("$5 og $10")
const MathSyntax: MarkdownConfig = {
  defineNodes: ['InlineMath', 'MathMark'],
  parseInline: [{
    name: 'InlineMath',
    parse(cx: InlineContext, next: number, pos: number) {
      if (next !== 36) return -1;
      const rest = cx.slice(pos, cx.end);
      const display = /^\$\$[\s\S]+?\$\$/.exec(rest);
      const inline = display ? null : /^\$(?=\S)[^$\n]*?\S\$(?!\d)|^\$[^\s$]\$(?!\d)/.exec(rest);
      const m = display ?? inline;
      if (!m) return -1;
      const width = display ? 2 : 1;
      const end = pos + m[0].length;
      return cx.addElement(cx.elt('InlineMath', pos, end, [cx.elt('MathMark', pos, pos + width), cx.elt('MathMark', end - width, end)]));
    }
  }]
};

// YAML properties between --- lines at the very top
const Frontmatter: MarkdownConfig = {
  defineNodes: [{ name: 'Frontmatter', block: true }, 'FrontmatterMark'],
  parseBlock: [{
    name: 'Frontmatter',
    parse(cx: BlockContext, line: Line) {
      if (cx.lineStart !== 0 || !/^---\s*$/.test(line.text)) return false;
      const children = [cx.elt('FrontmatterMark', 0, 3)];
      let to = line.text.length;
      while (cx.nextLine()) {
        to = cx.lineStart + line.text.length;
        if (/^(---|\.\.\.)\s*$/.test(line.text)) {
          children.push(cx.elt('FrontmatterMark', cx.lineStart, cx.lineStart + 3));
          cx.nextLine();
          break;
        }
      }
      cx.addElement(cx.elt('Frontmatter', 0, to, children));
      return true;
    },
    before: 'HorizontalRule'
  }]
};

const parser = (markdownLanguage.parser as MarkdownParser).configure([Frontmatter, Highlight, WikiLink, Footnote, Callout, CommentSyntax, Tag, MathSyntax]);

// Same language data as markdownLanguage, so its commands treat this as
// Markdown (isActiveAt compares the data facet)
export const skriveMarkdown = new Language(markdownLanguage.data, parser, [], 'markdown');
export const markdownParser = parser;
