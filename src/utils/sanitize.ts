import DOMPurify from 'dompurify';

// Configure DOMPurify to allow safe tags only
const DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'ul', 'ol', 'li',
                 'strong', 'b', 'em', 'i', 'u', 'strike', 's', 'del', 'code', 'pre',
                 'blockquote', 'a', 'span', 'div'],
  ALLOWED_ATTR: ['href', 'target', 'rel'],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'dir'],
};

// Sanitize HTML content
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, DOMPURIFY_CONFIG) as string;
}

const SAFE_PROTOCOLS = ['http:', 'https:', 'mailto:'];

// Check if URL is safe: allowlist of protocols, plus relative URLs
export function isSafeUrl(url: string): boolean {
  // Strip control characters that browsers ignore when parsing URLs
  // (e.g. "java\nscript:" would otherwise pass as a relative URL)
  const trimmed = url.replace(/[\u0000-\u001F\u007F]/g, '').trim();

  // Anything with a scheme must parse and use an allowlisted protocol
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    try {
      return SAFE_PROTOCOLS.includes(new URL(trimmed).protocol);
    } catch {
      return false;
    }
  }

  // Scheme-less input is treated as a relative URL
  return true;
}

// Escape a string for use inside a double-quoted HTML attribute
export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
