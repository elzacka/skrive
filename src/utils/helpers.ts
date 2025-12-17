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

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function getFormatFromExtension(filename: string): NoteFormat {
  if (filename.endsWith('.md')) return 'markdown';
  if (filename.endsWith('.xml')) return 'xml';
  if (filename.endsWith('.html')) return 'richtext';
  return 'plaintext';
}

export function getExtensionFromFormat(format: NoteFormat): string {
  switch (format) {
    case 'markdown': return '.md';
    case 'xml': return '.xml';
    case 'richtext': return '.html';
    default: return '.txt';
  }
}

export function getMimeTypeFromFormat(format: NoteFormat): string {
  switch (format) {
    case 'markdown': return 'text/markdown';
    case 'xml': return 'application/xml';
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
