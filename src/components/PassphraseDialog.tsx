import { useState } from 'react';
import { useApp } from '@/contexts';
import { i18n } from '@/utils/i18n';
import { CloseIcon } from './Icons';

interface PassphraseDialogProps {
  mode: 'set' | 'enter';
  onSubmit: (passphrase: string) => Promise<boolean>;
  onCancel: () => void;
}

export function PassphraseDialog({ mode, onSubmit, onCancel }: PassphraseDialogProps) {
  const { state } = useApp();
  const t = i18n[state.lang];
  const [passphrase, setPassphrase] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    if (mode === 'set') {
      if (passphrase.length < 8) {
        setError(t.passphraseTooShort);
        return;
      }
      if (passphrase !== repeat) {
        setError(t.passphraseMismatch);
        return;
      }
    }
    setBusy(true);
    const ok = await onSubmit(passphrase);
    setBusy(false);
    if (!ok) {
      setError(mode === 'enter' ? t.wrongPassphrase : t.backupFailed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && passphrase && !busy) {
      handleSubmit();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div className="link-dialog-overlay">
      <div className="link-dialog">
        <div className="link-dialog-header">
          <h3>{mode === 'set' ? t.setBackupPassphraseTitle : t.enterBackupPassphraseTitle}</h3>
          <button className="link-dialog-close" onClick={onCancel} aria-label={t.cancel}>
            <CloseIcon size={16} />
          </button>
        </div>
        <div className="link-dialog-body">
          <p className="backup-popup-detail">
            {mode === 'set' ? t.backupPassphraseHint : t.restorePassphraseHint}
          </p>
          <label>
            <span>{t.passphraseLabel}</span>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              autoComplete={mode === 'set' ? 'new-password' : 'current-password'}
            />
          </label>
          {mode === 'set' && (
            <label>
              <span>{t.repeatPassphraseLabel}</span>
              <input
                type="password"
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
                onKeyDown={handleKeyDown}
                autoComplete="new-password"
              />
            </label>
          )}
          {error && <p className="backup-popup-error">{error}</p>}
        </div>
        <div className="link-dialog-actions">
          <button className="action-btn" onClick={onCancel}>
            {t.cancel}
          </button>
          <button
            className="action-btn save-btn"
            onClick={handleSubmit}
            disabled={!passphrase || busy}
          >
            {t.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
