import { useEffect, useState } from 'react';
import { useApp } from '@/contexts';
import { i18n } from '@/utils/i18n';
import { formatDate } from '@/utils/helpers';
import { listVersions, type NoteVersion } from '@/utils/storage';
import { CloseIcon } from './Icons';

interface HistoryDialogProps {
  noteId: string;
  current: string;
  onRestore: (content: string) => void;
  onClose: () => void;
}

export function HistoryDialog({ noteId, current, onRestore, onClose }: HistoryDialogProps) {
  const { state } = useApp();
  const t = i18n[state.lang];
  const [versions, setVersions] = useState<NoteVersion[] | null>(null);
  const [selected, setSelected] = useState(0);

  // A version with the same text as the note has nothing to restore
  useEffect(() => {
    listVersions(noteId).then(all => setVersions(all.filter(v => v.content !== current)));
  }, [noteId, current]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const version = versions?.[selected];

  return (
    <div className="link-dialog-overlay" onClick={onClose}>
      <div className="link-dialog wide-dialog" role="dialog" aria-modal="true" aria-labelledby="history-title" onClick={(e) => e.stopPropagation()}>
        <div className="link-dialog-header">
          <h3 id="history-title">{t.history}</h3>
          <button className="link-dialog-close" onClick={onClose} aria-label={t.close} autoFocus>
            <CloseIcon size={16} />
          </button>
        </div>
        <div className="link-dialog-body">
          <p className="dialog-intro">{t.historyIntro}</p>
          {versions && versions.length === 0 && <p className="dialog-empty">{t.historyEmpty}</p>}
          {version && (
            <div className="history-view">
              <ul className="history-list">
                {versions.map((v, i) => (
                  <li key={`${v.savedAt}-${i}`}>
                    <button className={`history-item ${i === selected ? 'active' : ''}`} aria-pressed={i === selected} onClick={() => setSelected(i)}>
                      {formatDate(v.savedAt, state.lang)}
                    </button>
                  </li>
                ))}
              </ul>
              <pre className="history-preview" tabIndex={0}>{version.content}</pre>
            </div>
          )}
        </div>
        <div className="link-dialog-actions">
          {version ? (
            <>
              <button className="action-btn" onClick={onClose}>{t.cancel}</button>
              <button className="action-btn save-btn" onClick={() => onRestore(version.content)}>{t.restoreVersion}</button>
            </>
          ) : (
            <button className="action-btn save-btn" onClick={onClose}>{t.close}</button>
          )}
        </div>
      </div>
    </div>
  );
}
