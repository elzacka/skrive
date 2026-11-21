import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { InstanceGate } from './components/InstanceGate';

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

// Production only: in dev, vite-plugin-pwa serves its own dev worker and
// /skrive/sw.js does not exist
if (import.meta.env.PROD && 'serviceWorker' in navigator &&
    (window.location.protocol === 'https:' || window.location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/skrive/sw.js', { scope: '/skrive/' }).catch((error) => {
      console.log('Service worker registration failed:', error);
    });
  });
}

const root = createRoot(document.getElementById('root')!);
const mount = () => root.render(
  <StrictMode>
    <App />
  </StrictMode>
);

// One window at a time: each saves the whole state, so a second window
// would overwrite the first one's changes. A waiting window opens by itself
// once the other closes
const never = () => new Promise<void>(() => {});
if ('locks' in navigator) {
  navigator.locks.request('skrive-instance', { ifAvailable: true }, (lock) => {
    if (lock) {
      mount();
      return never();
    }
    root.render(<InstanceGate />);
    navigator.locks.request('skrive-instance', () => {
      mount();
      return never();
    });
    return undefined;
  });
} else {
  mount();
}
