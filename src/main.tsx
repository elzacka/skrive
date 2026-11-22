import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { InstanceGate } from './components/InstanceGate';
import { FileWindow } from './components/FileWindow';
import { registerAppUpdate } from './utils/appUpdate';
import { waitForLaunchedFile } from './utils/openFile';

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

const root = createRoot(document.getElementById('root')!);
const mount = () => root.render(
  <StrictMode>
    <App />
  </StrictMode>
);

// A file opened from Finder or File Explorer (manifest file_handlers) gets
// a window of its own. It never touches the notes, so it takes no lock, and
// it skips the update flow, whose reload would lose an unsaved edit
const never = () => new Promise<void>(() => {});
if (new URLSearchParams(location.search).has('file')) {
  const launched = waitForLaunchedFile();
  root.render(
    <StrictMode>
      <FileWindow launched={launched} />
    </StrictMode>
  );
} else if ('locks' in navigator) {
  registerAppUpdate();
  // One window at a time: each saves the whole state, so a second window
  // would overwrite the first one's changes. A waiting window opens by itself
  // once the other closes
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
  registerAppUpdate();
  mount();
}
