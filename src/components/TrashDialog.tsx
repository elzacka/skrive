import { useEffect, useRef } from 'react';
import { useApp } from '@/contexts';
import { i18n } from '@/utils/i18n';
import { trashDaysLeft } from '@/utils/storage';
import { markdownToPlainText } from '@/utils/markdown';
import { CloseIcon, DeleteIcon, RestoreIcon, TrashXIcon } from './Icons';

export function TrashDialog({ onClose }: { onClose: () => void }) {
  const { state, restoreFromTrash, purgeFromTrash } = useApp();
  const t = i18n[state.lang];
  const items = [...state.trash].sort((a, b) => b.deletedAt - a.deletedAt);
  // A row action removes the focused button; focus stays in the dialog
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const purge = (ids: string[], question: string) => {
    if (confirm(question)) purgeFromTrash(ids);
    closeRef.current?.focus();
  };

  const restore = (id: string) => {
    restoreFromTrash([id]);
    closeRef.current?.focus();
  };

  return (
    <div className="link-dialog-overlay" onClick={onClose}>
      <div className="link-dialog" role="dialog" aria-modal="true" aria-labelledby="trash-title" onClick={(e) => e.stopPropagation()}>
        <div className="link-dialog-header">
          <h3 id="trash-title">{t.trash}</h3>
          <button ref={closeRef} className="link-dialog-close" onClick={onClose} aria-label={t.close} autoFocus>
            <CloseIcon size={16} />
          </button>
        </div>
        <div className="link-dialog-body">
          {items.length === 0 ? (
            <div className="dialog-empty">
              <DeleteIcon size={28} />
              <p>{t.trashEmpty}</p>
              <p className="dialog-empty-hint">{t.trashIntro}</p>
            </div>
          ) : (
            <ul className="trash-list">
              {items.map(note => {
                const days = trashDaysLeft(note);
                const name = note.title || markdownToPlainText(note.content).slice(0, 60) || t.untitled;
                return (
                  <li key={note.id} className="trash-item">
                    <div className="trash-item-text">
                      <span className="trash-item-title">{name}</span>
                      <span className="trash-item-meta">
                        {days === 1 ? t.trashOneDayLeft : t.trashDaysLeft.replace('{n}', String(days))}
                      </span>
                    </div>
                    <button className="row-icon-btn" onClick={() => restore(note.id)} title={t.restoreNote} aria-label={`${t.restoreNote}: ${name}`}>
                      <RestoreIcon size={16} />
                    </button>
                    <button className="row-icon-btn danger" onClick={() => purge([note.id], t.confirmDeleteForever)} title={t.deleteForever} aria-label={`${t.deleteForever}: ${name}`}>
                      <TrashXIcon size={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {items.length > 0 && (
          <div className="link-dialog-actions">
            <button className="text-btn danger dialog-action-start" onClick={() => purge(items.map(n => n.id), t.confirmEmptyTrash)}>
              {t.emptyTrash}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
