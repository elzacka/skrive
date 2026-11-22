import { useRef, useState } from 'react';
import { useModal } from '@/hooks';
import { useApp } from '@/contexts';
import { i18n } from '@/utils/i18n';
import { MIN_PASSPHRASE_LENGTH } from '@/utils/crypto';
import { CloseIcon } from './Icons';

interface PassphraseDialogProps {
  mode: 'set' | 'enter';
  hint?: string;
  onSubmit: (passphrase: string) => Promise<boolean>;
  onCancel: () => void;
  // Where focus goes on close when the element that opened it is gone
  returnFocus?: () => HTMLElement | null;
}

export function PassphraseDialog({ mode, hint, onSubmit, onCancel, returnFocus }: PassphraseDialogProps) {
  const { state } = useApp();
  const t = i18n[state.lang];
  const [passphrase, setPassphrase] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useModal(dialogRef, returnFocus);

  const handleSubmit = async () => {
    setError(null);
    if (mode === 'set') {
      if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
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
    if (e.key === 'Enter' && passphrase && !busy) handleSubmit();
  };

  return (
    <div className="link-dialog-overlay">
      <div ref={dialogRef} className="link-dialog" role="dialog" aria-modal="true" aria-labelledby="passphrase-title" onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}>
        <div className="link-dialog-header">
          <h3 id="passphrase-title">{mode === 'set' ? t.setBackupPassphraseTitle : t.enterBackupPassphraseTitle}</h3>
          <button className="link-dialog-close" onClick={onCancel} aria-label={t.close}>
            <CloseIcon size={16} />
          </button>
        </div>
        <div className="link-dialog-body">
          <p className="dialog-intro">
            {hint ?? (mode === 'set' ? t.backupPassphraseHint : t.restorePassphraseHint)}
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
          {error && <p className="dialog-error">{error}</p>}
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
            {mode === 'set' ? t.enableAutoBackup : t.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
