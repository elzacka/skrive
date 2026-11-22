import { useEffect, useState } from 'react';
import { useApp } from '@/contexts';
import { i18n } from '@/utils/i18n';
import { justUpdated, useAppUpdate } from '@/utils/appUpdate';
import { CheckIcon, RefreshIcon } from './Icons';

// Matches the update-done animation in main.css, which fades it out
const CONFIRMATION_MS = 2600;

// Shown only when a new version is downloaded; the reload removes it, so a
// check mark in its place confirms the update
export function UpdateButton() {
  const { state, flushSave } = useApp();
  const t = i18n[state.lang];
  const { ready, applying, apply } = useAppUpdate();
  const [confirming, setConfirming] = useState(justUpdated);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), CONFIRMATION_MS);
    return () => clearTimeout(timer);
  }, [confirming]);

  if (confirming) {
    return (
      <span className="update-done" role="status" title={t.appUpdated}>
        <CheckIcon size={14} />
        <span className="visually-hidden">{t.appUpdated}</span>
      </span>
    );
  }

  if (!ready) return null;

  // The pending save goes first; a live edit not yet saved reaches the
  // pagehide spill during the reload
  const update = async () => {
    await flushSave();
    void apply();
  };

  return (
    <button
      className={`action-btn icon-btn update-btn ${applying ? 'applying' : ''}`}
      onClick={update}
      disabled={applying}
      aria-busy={applying}
      title={t.updateApp}
      aria-label={t.updateApp}
    >
      <RefreshIcon />
      <span className="visually-hidden" role="status">{applying ? t.updatingApp : ''}</span>
    </button>
  );
}
