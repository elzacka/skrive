import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// Enforce HTTPS in production
if (import.meta.env.PROD && window.location.protocol === 'http:' && window.location.hostname !== 'localhost') {
  window.location.href = window.location.href.replace('http:', 'https:');
}

// Clickjacking protection: frame-ancestors in a meta CSP is ignored by
// browsers, and GitHub Pages cannot set HTTP headers, so refuse to render
// when framed
if (window.self !== window.top) {
  document.documentElement.style.display = 'none';
  throw new Error('Skrive refuses to run inside a frame');
}

// Register service worker (only on HTTPS or localhost)
if ('serviceWorker' in navigator &&
    (window.location.protocol === 'https:' || window.location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/skrive/sw.js', { scope: '/skrive/' }).catch((error) => {
      console.log('Service worker registration failed:', error);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
