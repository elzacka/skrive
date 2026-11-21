import { useState, useEffect } from 'react';
import { AppProvider, useApp } from '@/contexts';
import type { RecoveryResult } from '@/contexts/AppContext';
import { Sidebar, Editor, SidebarToggle, PassphraseDialog, ScreenGate } from '@/components';
import { CloseIcon } from '@/components/Icons';
import { useKeyboardShortcuts, useMediaQuery } from '@/hooks';
import { i18n } from '@/utils/i18n';
import '@/styles/main.css';

// Phones: coarse pointer plus a small viewport in either orientation
// (landscape phones are wide but short; tablets are at least 500px tall)
const PHONE_QUERY = '(pointer: coarse) and (max-width: 767px), (pointer: coarse) and (max-height: 500px)';
// Any viewport too narrow for the sidebar-plus-editor layout
const NARROW_QUERY = '(max-width: 767px)';

function AppContent() {
  useKeyboardShortcuts();
  const {
    state,
    pendingRestore,
    confirmRestore,
    cancelRestore,
    startupBlocked,
    resetUnreadableKey,
    recoveryCopies,
    recoverCopies,
    discardRecoveryCopies,
    lastDeletedNotes,
    undoDelete,
    dismissDeleted
  } = useApp();
  const t = i18n[state.lang];
  const [recoveryState, setRecoveryState] = useState<'idle' | 'passphrase' | 'failed' | 'saveFailed' | 'hidden'>('idle');

  if (startupBlocked) {
    const resetKey = async () => {
      if (confirm(t.confirmKeyReset)) await resetUnreadableKey();
    };
    return (
      <div className="screen-gate">
        <h1>{startupBlocked === 'key' ? t.keyErrorTitle : t.storageErrorTitle}</h1>
        <p>{startupBlocked === 'key' ? t.keyErrorBody : t.storageErrorBody}</p>
        <div className="screen-gate-actions">
          <button onClick={() => location.reload()}>{t.reload}</button>
          {startupBlocked === 'key' && <button onClick={resetKey}>{t.keyReset}</button>}
        </div>
      </div>
    );
  }

  const showResult = (result: RecoveryResult) => {
    setRecoveryState(result === 'done' ? 'idle'
      : result === 'needPassphrase' ? 'passphrase'
      : result === 'saveFailed' ? 'saveFailed'
      : 'failed');
  };

  const startRecovery = async () => showResult(await recoverCopies());

  const discardRecovery = async () => {
    if (!confirm(t.confirmDeleteRecovery)) return;
    await discardRecoveryCopies();
    setRecoveryState('idle');
  };

  return (
    <div className="app">
      {recoveryCopies > 0 && recoveryState !== 'hidden' && (
        <div className="storage-banner" role="alert">
          <span>{recoveryState === 'failed' ? t.recoveryFailed : recoveryState === 'saveFailed' ? t.saveError : t.recoveryAvailable}</span>
          <span className="storage-banner-actions">
            {recoveryState === 'failed' ? (
              <button className="storage-banner-close" onClick={discardRecovery}>{t.deleteRecovery}</button>
            ) : (
              <button className="storage-banner-close" onClick={startRecovery}>{t.recover}</button>
            )}
            <button className="storage-banner-close" onClick={() => setRecoveryState('hidden')}>{t.close}</button>
          </span>
        </div>
      )}
      {recoveryState === 'passphrase' && (
        <PassphraseDialog
          mode="enter"
          hint={t.recoveryPassphraseHint}
          onSubmit={async (passphrase) => {
            const result = await recoverCopies(passphrase);
            if (result === 'wrongPassphrase') return false;
            showResult(result);
            return true;
          }}
          onCancel={() => setRecoveryState('failed')}
        />
      )}
      <div className="main-content">
        <Sidebar />
        <SidebarToggle />
        <Editor />
      </div>
      {pendingRestore && (
        <PassphraseDialog mode="enter" onSubmit={confirmRestore} onCancel={cancelRestore} />
      )}
      {lastDeletedNotes && (
        <div className="undo-toast" role="status">
          <span>
            {lastDeletedNotes.length === 1
              ? t.noteDeleted
              : `${lastDeletedNotes.length} ${t.notesDeleted}`}
          </span>
          <button className="undo-toast-btn" onClick={undoDelete}>
            {t.undo}
          </button>
          <button className="undo-toast-close" onClick={dismissDeleted} aria-label={t.close}>
            <CloseIcon size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const phone = useMediaQuery(PHONE_QUERY);
  const narrow = useMediaQuery(NARROW_QUERY);

  // On phones the app never mounts: notes are per-device, so there is no
  // data to reach, and mounting would create stranded first-run state.
  // But once mounted (e.g. tablet rotating to portrait), keep the app
  // alive under the gate overlay - a debounced save could be pending
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    if (!phone) setHasMounted(true);
  }, [phone]);

  if (phone && !hasMounted) {
    return <ScreenGate />;
  }

  return (
    <AppProvider>
      {(phone || narrow) && <ScreenGate />}
      <AppContent />
    </AppProvider>
  );
}
