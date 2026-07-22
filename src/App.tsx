import { AppProvider, useApp } from '@/contexts';
import { Sidebar, Editor, SidebarToggle, PassphraseDialog } from '@/components';
import { CloseIcon } from '@/components/Icons';
import { useKeyboardShortcuts } from '@/hooks';
import { i18n } from '@/utils/i18n';
import '@/styles/main.css';

function AppContent() {
  useKeyboardShortcuts();
  const {
    state,
    pendingRestore,
    confirmRestore,
    cancelRestore,
    storageLoadError,
    dismissStorageError,
    lastDeletedNotes,
    undoDelete,
    dismissDeleted
  } = useApp();
  const t = i18n[state.lang];

  return (
    <div className="app">
      {storageLoadError && (
        <div className="storage-banner" role="alert">
          <span>{t.storageLoadError}</span>
          <button className="storage-banner-close" onClick={dismissStorageError} aria-label={t.close}>
            {t.close}
          </button>
        </div>
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
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
