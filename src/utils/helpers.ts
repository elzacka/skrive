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

export function isMac(): boolean {
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0 || 
         navigator.userAgent.toUpperCase().indexOf('MAC') >= 0;
}

export function isFileSystemAccessSupported(): boolean {
  return 'showDirectoryPicker' in window;
}

export function isFirefox(): boolean {
  return /firefox|fxios/i.test(navigator.userAgent);
}

export function isSafari(): boolean {
  return /safari/i.test(navigator.userAgent) &&
         !/chrome|chromium|crios|edg|opr|fxios/i.test(navigator.userAgent);
}

// iPadOS reports the Mac platform; touch support is the tell
export function isIpad(): boolean {
  return navigator.maxTouchPoints > 1 && isMac();
}

export function isPWAInstalled(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
         (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}
