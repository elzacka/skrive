import type { NoteFormat } from '@/types';

export function generateId(): string {
  return 'id-' + Date.now() + '-' + Math.random().toString(36).substring(2, 11);
}

export function formatDate(timestamp: number, lang: 'no' | 'en'): string {
  const locale = lang === 'no' ? 'nb-NO' : 'en-US';
  return new Date(timestamp).toLocaleString(locale);
}

export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function stripHtml(html: string): string {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

export function getFormatFromExtension(filename: string): NoteFormat {
  if (filename.endsWith('.md')) return 'markdown';
  if (filename.endsWith('.html')) return 'richtext';
  return 'plaintext';
}

export function getExtensionFromFormat(format: NoteFormat): string {
  switch (format) {
    case 'markdown': return '.md';
    case 'richtext': return '.html';
    default: return '.txt';
  }
}

export function getMimeTypeFromFormat(format: NoteFormat): string {
  switch (format) {
    case 'markdown': return 'text/markdown';
    case 'richtext': return 'text/html';
    default: return 'text/plain';
  }
}

export function debounce<T extends (...args: unknown[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function isMac(): boolean {
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0 || 
         navigator.userAgent.toUpperCase().indexOf('MAC') >= 0;
}

export function isFileSystemAccessSupported(): boolean {
  return 'showDirectoryPicker' in window;
}

export function isPWAInstalled(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
         (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function htmlToMarkdown(html: string): string {
  return html
    // Headings
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
    // Text formatting
    .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b>(.*?)<\/b>/gi, '**$1**')
    .replace(/<em>(.*?)<\/em>/gi, '*$1*')
    .replace(/<i>(.*?)<\/i>/gi, '*$1*')
    .replace(/<code>(.*?)<\/code>/gi, '`$1`')
    // Links - convert to markdown format
    .replace(/<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    // Lists
    .replace(/<li>(.*?)<\/li>/gi, '- $1\n')
    // Blockquotes
    .replace(/<blockquote>(.*?)<\/blockquote>/gi, '> $1\n')
    // Line breaks and paragraphs
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    // Remove remaining HTML tags
    .replace(/<[^>]+>/g, '')
    // Unescape HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    // Clean up extra whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function htmlToRtf(html: string): string {
  if (!html) return '';

  let rtf = html;

  // First, decode HTML entities before RTF conversion
  rtf = rtf.replace(/&nbsp;/g, ' ');
  rtf = rtf.replace(/&amp;/g, '&');
  rtf = rtf.replace(/&lt;/g, '<');
  rtf = rtf.replace(/&gt;/g, '>');
  rtf = rtf.replace(/&quot;/g, '"');

  // Line breaks and paragraphs
  rtf = rtf.replace(/<br\s*\/?>/gi, '\\line\n');
  rtf = rtf.replace(/<\/p>/gi, '\\par\n');
  rtf = rtf.replace(/<p[^>]*>/gi, '');

  // Headings (with larger font sizes - RTF uses half-points, so 24pt = fs48)
  rtf = rtf.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '{\\fs48\\b $1}\\par\n');
  rtf = rtf.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '{\\fs36\\b $1}\\par\n');
  rtf = rtf.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '{\\fs28\\b $1}\\par\n');

  // Text formatting
  rtf = rtf.replace(/<(?:b|strong)[^>]*>(.*?)<\/(?:b|strong)>/gi, '{\\b $1}');
  rtf = rtf.replace(/<(?:i|em)[^>]*>(.*?)<\/(?:i|em)>/gi, '{\\i $1}');
  rtf = rtf.replace(/<(?:u|ins)[^>]*>(.*?)<\/(?:u|ins)>/gi, '{\\ul $1}');
  rtf = rtf.replace(/<code[^>]*>(.*?)<\/code>/gi, '{\\f1 $1}');

  // Lists
  rtf = rtf.replace(/<li[^>]*>(.*?)<\/li>/gi, '\\bullet  $1\\par\n');
  rtf = rtf.replace(/<\/?(?:ul|ol)[^>]*>/gi, '');

  // Blockquotes
  rtf = rtf.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '{\\li720 $1}\\par\n');

  // Links (keep text only)
  rtf = rtf.replace(/<a[^>]*>(.*?)<\/a>/gi, '$1');

  // Remove remaining HTML tags
  rtf = rtf.replace(/<[^>]+>/g, '');

  // RTF wrapper with font table
  return `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0 Arial;}{\\f1 Courier New;}}
${rtf}
}`;
}
