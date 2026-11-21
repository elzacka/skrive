import { markdownLanguage } from '@codemirror/lang-markdown';
import { escapeHtml } from './helpers';
import { sanitizeHtml, isSafeUrl, escapeHtmlAttribute } from './sanitize';

// Markdown is the stored note format. Export, copy and the one-time
// conversion of HTML notes go through the editor's own parser, so what the
// editor shows and what leaves the app always agree

type SyntaxNode = ReturnType<typeof markdownLanguage.parser.parse>['topNode'];

const SKIPPED = new Set(['HeaderMark', 'QuoteMark', 'ListMark', 'EmphasisMark', 'CodeMark',
  'CodeInfo', 'LinkMark', 'StrikethroughMark', 'TableDelimiter', 'Comment', 'LinkTitle', 'LinkLabel']);

function children(node: SyntaxNode): SyntaxNode[] {
  const list: SyntaxNode[] = [];
  for (let c = node.firstChild; c; c = c.nextSibling) list.push(c);
  return list;
}

// Text of a node with marks skipped and child nodes rendered; soft line
// breaks become <br>, since notes keep the lines the user typed
function inline(node: SyntaxNode, src: string, from = node.from, to = node.to): string {
  let out = '';
  let pos = from;
  for (const c of children(node)) {
    if (c.to <= from || c.from >= to) continue;
    out += text(src.slice(pos, c.from));
    out += render(c, src);
    pos = c.to;
  }
  return out + text(src.slice(pos, to));
}

function text(raw: string): string {
  return escapeHtml(raw).replace(/\n[ \t]*/g, '<br>');
}

function blocks(node: SyntaxNode, src: string): string {
  return children(node).map(c => render(c, src)).join('');
}

function render(node: SyntaxNode, src: string): string {
  const name = node.name;
  if (SKIPPED.has(name)) return '';
  const heading = /^(?:ATX|Setext)Heading(\d)$/.exec(name);
  if (heading) return `<h${heading[1]}>${inline(node, src).replace(/^(?:\s|<br>)+|(?:\s|<br>)+$/g, '')}</h${heading[1]}>`;

  switch (name) {
    case 'Document': return blocks(node, src);
    case 'Paragraph': return `<p>${inline(node, src).trim()}</p>`;
    case 'Blockquote': return `<blockquote>${blocks(node, src)}</blockquote>`;
    case 'BulletList': return `<ul>${blocks(node, src)}</ul>`;
    case 'OrderedList': {
      const start = parseInt(src.slice(node.from, node.to), 10);
      return start > 1 ? `<ol start="${start}">${blocks(node, src)}</ol>` : `<ol>${blocks(node, src)}</ol>`;
    }
    case 'ListItem': return `<li>${blocks(node, src)}</li>`;
    case 'Task': {
      const marker = node.getChild('TaskMarker');
      const done = marker ? /x/i.test(src.slice(marker.from, marker.to)) : false;
      return `${done ? '☑' : '☐'} ${inline(node, src, marker ? marker.to : node.from).trim()}`;
    }
    case 'FencedCode': {
      const code = node.getChild('CodeText');
      return `<pre><code>${code ? escapeHtml(src.slice(code.from, code.to)) : ''}</code></pre>`;
    }
    case 'CodeBlock': return `<pre><code>${escapeHtml(src.slice(node.from, node.to).replace(/^ {4}/gm, ''))}</code></pre>`;
    case 'HorizontalRule': return '<hr>';
    case 'StrongEmphasis': return `<strong>${inline(node, src)}</strong>`;
    case 'Emphasis': return `<em>${inline(node, src)}</em>`;
    case 'Strikethrough': return `<s>${inline(node, src)}</s>`;
    case 'InlineCode': {
      const marks = node.getChildren('CodeMark');
      const from = marks[0]?.to ?? node.from;
      const to = marks[1]?.from ?? node.to;
      // CommonMark drops one space on each side when both are there
      const code = src.slice(from, to).replace(/^ (.*[^ ].*) $/s, '$1');
      return `<code>${escapeHtml(code)}</code>`;
    }
    case 'Link': {
      const marks = node.getChildren('LinkMark');
      const url = node.getChild('URL');
      const label = marks.length >= 2 ? inline(node, src, marks[0].to, marks[1].from) : inline(node, src);
      const href = url ? src.slice(url.from, url.to) : '';
      return href && isSafeUrl(href)
        ? `<a href="${escapeHtmlAttribute(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`
        : label;
    }
    case 'URL':
    case 'Autolink': {
      const href = src.slice(node.from, node.to).replace(/^<|>$/g, '');
      return isSafeUrl(href) && /^(https?:|mailto:)/i.test(href)
        ? `<a href="${escapeHtmlAttribute(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(href)}</a>`
        : escapeHtml(href);
    }
    // Images never load: the CSP blocks external hosts. Keep the alt text
    case 'Image': {
      const marks = node.getChildren('LinkMark');
      return marks.length >= 2 ? escapeHtml(src.slice(marks[0].to, marks[1].from)) : '';
    }
    case 'HardBreak': return '<br>';
    case 'Escape': return escapeHtml(src.slice(node.from + 1, node.to));
    case 'Table': {
      const rows = children(node).filter(c => c.name === 'TableHeader' || c.name === 'TableRow');
      return `<table>${rows.map(row => {
        const tag = row.name === 'TableHeader' ? 'th' : 'td';
        return `<tr>${row.getChildren('TableCell').map(cell => `<${tag}>${inline(cell, src).trim()}</${tag}>`).join('')}</tr>`;
      }).join('')}</table>`;
    }
    default:
      // Unknown syntax (HTML, emoji, sub/superscript) stays as typed
      return text(src.slice(node.from, node.to));
  }
}

export function markdownToHtml(md: string): string {
  if (!md) return '';
  const tree = markdownLanguage.parser.parse(md);
  return sanitizeHtml(render(tree.topNode, md));
}

// Plain text for copy, word counts and titles: marks removed, text kept
export function markdownToPlainText(md: string): string {
  const html = markdownToHtml(md)
    .replace(/<br>/g, '\n')
    .replace(/<\/(p|h\d|li|blockquote|pre|tr)>/g, '\n')
    .replace(/<\/t[hd]>/g, '\t');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
}

// Parentheses and spaces would end a Markdown link target early;
// encodeURIComponent leaves parentheses as they are
export function encodeLinkTarget(url: string): string {
  return url.replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\s/g, '%20');
}

// Characters that would turn plain text into Markdown syntax
// "_" only at a word edge: inside a word (snake_case) it is never emphasis
function escapeMarkdown(value: string): string {
  return value
    .replace(/[\\`*[\]]/g, '\\$&')
    .replace(/~~/g, '\\~\\~')
    .replace(/(?<!\w)_|_(?!\w)/g, '\\_');
}

function escapeLineStart(line: string): string {
  return line.replace(/^(\s*)(#{1,6}\s|>|[-+]\s|\d+[.)]\s)/, '$1\\$2');
}

function inlineMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeMarkdown((node.textContent ?? '').replace(/\s+/g, ' '));
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as HTMLElement;
  const inner = () => Array.from(el.childNodes).map(inlineMarkdown).join('');
  const wrap = (mark: string) => {
    const content = inner();
    // Marks must hug the text: "** fet **" is not bold in Markdown
    const match = /^(\s*)(.*?)(\s*)$/s.exec(content)!;
    return match[2] ? `${match[1]}${mark}${match[2]}${mark}${match[3]}` : content;
  };
  switch (el.tagName.toLowerCase()) {
    case 'strong': case 'b': return wrap('**');
    case 'em': case 'i': return wrap('*');
    case 's': case 'del': case 'strike': return wrap('~~');
    case 'code': {
      // Backslashes do not escape inside code; a longer backtick run does
      const code = el.textContent ?? '';
      const fence = '`'.repeat(Math.max(0, ...(code.match(/`+/g) ?? []).map(run => run.length)) + 1);
      return fence.length > 1 || /^`|`$/.test(code) ? `${fence} ${code} ${fence}` : `${fence}${code}${fence}`;
    }
    case 'br': return '\n';
    case 'a': {
      const href = el.getAttribute('href') ?? '';
      const label = inner();
      return href && isSafeUrl(href) ? `[${label || href}](${encodeLinkTarget(href)})` : label;
    }
    default: return inner();
  }
}

const BLOCK_TAGS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
  'blockquote', 'pre', 'hr', 'table']);

function blockMarkdown(el: Element, listDepth = 0): string[] {
  const out: string[] = [];
  let inlineRun = '';
  const flush = () => {
    const lines = inlineRun.split('\n').map(l => escapeLineStart(l.trim()));
    if (lines.some(Boolean)) out.push(lines.join('\n').trim());
    inlineRun = '';
  };

  for (const child of Array.from(el.childNodes)) {
    const tag = child.nodeType === Node.ELEMENT_NODE ? (child as Element).tagName.toLowerCase() : '';
    const c = child as HTMLElement;
    // An inline wrapper around blocks (Google Docs wraps a whole copy in
    // <b>) is read as the blocks it holds
    if (!BLOCK_TAGS.has(tag)) {
      if (tag && c.querySelector(Array.from(BLOCK_TAGS).join(','))) {
        flush();
        out.push(...blockMarkdown(c, listDepth));
      } else {
        inlineRun += inlineMarkdown(child);
      }
      continue;
    }
    flush();
    const heading = /^h(\d)$/.exec(tag);
    if (heading) {
      out.push(`${'#'.repeat(Number(heading[1]))} ${inlineMarkdown(c).replace(/\n/g, ' ').trim()}`);
    } else if (tag === 'ul' || tag === 'ol') {
      const start = Number(c.getAttribute('start')) || 1;
      // A list directly inside a list (common in pasted HTML) belongs to
      // the item before it
      const items: { marker: string; lines: string[] }[] = [];
      for (const item of Array.from(c.children)) {
        const itemTag = item.tagName.toLowerCase();
        if (itemTag === 'li') {
          const marker = tag === 'ol' ? `${start + items.length}. ` : '- ';
          items.push({ marker, lines: blockMarkdown(item, listDepth + 1).join('\n').split('\n') });
        } else if (itemTag === 'ul' || itemTag === 'ol') {
          const wrapper = document.createElement('div');
          wrapper.appendChild(item.cloneNode(true));
          const nested = blockMarkdown(wrapper, listDepth + 1).join('\n').split('\n');
          if (items.length) items[items.length - 1].lines.push(...nested);
          else items.push({ marker: '- ', lines: nested });
        }
      }
      // Continuation and nested lists line up with the item text, which
      // starts after the marker ("2. " is three wide, "- " two)
      out.push(items.map(({ marker, lines: [first = '', ...rest] }) =>
        [marker + first, ...rest.map(l => (l ? ' '.repeat(marker.length) + l : l))].join('\n')).join('\n'));
    } else if (tag === 'blockquote') {
      out.push(blockMarkdown(c, listDepth).join('\n\n').split('\n').map(l => (l ? `> ${l}` : '>')).join('\n'));
    } else if (tag === 'pre') {
      const code = (c.textContent ?? '').replace(/\n$/, '');
      const fence = '`'.repeat(Math.max(3, ...(code.match(/^`{3,}/gm) ?? []).map(run => run.length + 1)));
      out.push(`${fence}\n${code}\n${fence}`);
    } else if (tag === 'hr') {
      out.push('---');
    } else if (tag === 'table') {
      const rows = Array.from(c.querySelectorAll('tr')).map(tr =>
        Array.from(tr.children).map(cell => inlineMarkdown(cell).replace(/\n/g, ' ').replace(/\|/g, '\\|').trim()));
      if (rows.length > 0) {
        const width = Math.max(...rows.map(r => r.length));
        const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`;
        out.push([line(rows[0]), `|${' --- |'.repeat(width)}`, ...rows.slice(1).map(line)].join('\n'));
      }
    } else {
      out.push(...blockMarkdown(c, listDepth));
    }
  }
  flush();
  // Items inside a list are joined tightly; blocks elsewhere get a blank line
  return listDepth > 0 ? [out.join('\n')] : out;
}

export function htmlToMarkdown(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(sanitizeHtml(html), 'text/html');
  return blockMarkdown(doc.body).join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Name from the first non-empty line, without its Markdown marks
export function titleFromMarkdown(md: string): string {
  const line = md.split('\n').map(l => l.trim()).find(l => l.length > 0) || '';
  return markdownToPlainText(line).replace(/\s+/g, ' ').trim().slice(0, 60);
}
