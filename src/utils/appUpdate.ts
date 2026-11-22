import { useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';

// A long session never navigates, so the browser's own service worker check
// would not run; this one does
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
// Activating a downloaded worker takes milliseconds; if nothing happens in
// this time, another window took the version and a reload gets it anyway
const CONTROLLER_TIMEOUT_MS = 2500;
// Survives the reload, so the button can confirm the update; per tab
const APPLIED_FLAG = 'skrive-updated';

interface UpdateState {
  ready: boolean;
  applying: boolean;
}

let state: UpdateState = { ready: false, applying: false };
const initialState = state;
const listeners = new Set<() => void>();

function setState(next: Partial<UpdateState>) {
  state = { ...state, ...next };
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function readAppliedFlag(): boolean {
  try {
    if (sessionStorage.getItem(APPLIED_FLAG) === null) return false;
    sessionStorage.removeItem(APPLIED_FLAG);
    return true;
  } catch {
    return false;
  }
}

let reloading = false;
function reloadOnce() {
  if (reloading) return;
  reloading = true;
  try {
    sessionStorage.setItem(APPLIED_FLAG, '1');
  } catch {
    // Only the confirmation is lost
  }
  window.location.reload();
}

// Not vite-plugin-pwa's updateSW(): it reloads only on a controlling event
// it marked itself, and does nothing when the waiting worker is gone
async function applyUpdate() {
  if (state.applying) return;
  setState({ applying: true });
  if (!('serviceWorker' in navigator)) {
    reloadOnce();
    return;
  }
  navigator.serviceWorker.addEventListener('controllerchange', reloadOnce, { once: true });
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
  } catch {
    // The timeout below reloads anyway
  }
  window.setTimeout(reloadOnce, CONTROLLER_TIMEOUT_MS);
}

export function useAppUpdate() {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => initialState);
  return { ...snapshot, apply: applyUpdate };
}

// Read once per page load, before React mounts
export const justUpdated = readAppliedFlag();

// A new version waits, downloaded, until the user presses the update button:
// no automatic reload in the middle of writing
export function registerAppUpdate() {
  registerSW({
    onNeedRefresh() {
      setState({ ready: true });
    },
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      setInterval(async () => {
        if (registration.installing || !navigator.onLine) return;
        const response = await fetch(swUrl, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } }).catch(() => null);
        if (response?.status === 200) await registration.update();
      }, CHECK_INTERVAL_MS);
    }
  });
}
