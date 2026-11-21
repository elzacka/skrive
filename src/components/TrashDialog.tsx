import { useEffect } from 'react';
import { useApp } from '@/contexts';
import { i18n } from '@/utils/i18n';
import { formatDate } from '@/utils/helpers';
import { markdownToPlainText } from '@/utils/markdown';
import { CloseIcon } from './Icons';

export function TrashDialog({ onClose }: { onClose: () => void }) {
  const { state, restoreFromTrash, purgeFromTrash } = useApp();
  const t = i18n[state.lang];
  const items = [...state.trash].sort((a, b) => b.deletedAt - a.deletedAt);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const purge = (ids: string[], question: string) => {
    if (confirm(question)) purgeFromTrash(ids);
  };

  return (
    <div className="link-dialog-overlay" onClick={onClose}>
      <div className="link-dialog wide-dialog" role="dialog" aria-modal="true" aria-labelledby="trash-title" onClick={(e) => e.stopPropagation()}>
        <div className="link-dialog-header">
          <h3 id="trash-title">{t.trash}</h3>
          <button className="link-dialog-close" onClick={onClose} aria-label={t.close} autoFocus>
            <CloseIcon size={16} />
          </button>
        </div>
        <div className="link-dialog-body">
          <p className="backup-popup-detail">{t.trashIntro}</p>
          {items.length === 0 ? (
            <p className="dialog-empty">{t.trashEmpty}</p>
          ) : (
            <ul className="trash-list">
              {items.map(note => (
                <li key={note.id} className="trash-item">
                  <div className="trash-item-text">
                    <span className="trash-item-title">{note.title || t.untitled}</span>
                    <span className="trash-item-meta">
                      {t.deletedOn} {formatDate(note.deletedAt, state.lang)}
                      {note.content && ` · ${markdownToPlainText(note.content).slice(0, 80)}`}
                    </span>
                  </div>
                  <button className="action-btn" onClick={() => restoreFromTrash([note.id])}>{t.restoreNote}</button>
                  <button className="action-btn" onClick={() => purge([note.id], t.confirmDeleteForever)}>{t.deleteForever}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="link-dialog-actions">
          <button className="action-btn" onClick={() => purge(items.map(n => n.id), t.confirmEmptyTrash)} disabled={items.length === 0}>
            {t.emptyTrash}
          </button>
          <button className="action-btn save-btn" onClick={onClose}>{t.close}</button>
        </div>
      </div>
    </div>
  );
}
