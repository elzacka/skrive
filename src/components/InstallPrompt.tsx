import { useState, useEffect } from 'react';
import { useApp } from '@/contexts';
import { i18n } from '@/utils/i18n';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
  const { state } = useApp();
  const t = i18n[state.lang];
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
  };

  if (!deferredPrompt || dismissed) {
    return null;
  }

  return (
    <div className="install-prompt" role="dialog" aria-labelledby="install-prompt-title">
      <div className="install-prompt-title" id="install-prompt-title">
        {state.lang === 'no' ? 'Installer Skrive' : 'Install Skrive'}
      </div>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
        {state.lang === 'no'
          ? 'For raskere tilgang og offline-bruk.'
          : 'For faster access and offline use.'}
      </p>
      <div className="install-prompt-actions">
        <button className="action-btn save-btn" onClick={handleInstall}>
          {t.install}
        </button>
        <button className="action-btn" onClick={handleDismiss}>
          {state.lang === 'no' ? 'Ikke nå' : 'Not now'}
        </button>
      </div>
    </div>
  );
}
