import { useState, useEffect } from 'react';
import { AppProvider } from '@/contexts';
import { Header, Sidebar, Editor, SidebarToggle, InstallPrompt, PasswordPrompt } from '@/components';
import { useKeyboardShortcuts } from '@/hooks';
import { initCrypto, getMasterKey } from '@/utils/crypto';
import { needsPasswordUnlock } from '@/utils/storage';
import '@/styles/main.css';

function AppContent() {
  useKeyboardShortcuts();

  return (
    <div className="app">
      <Header />
      <div className="main-content">
        <Sidebar />
        <SidebarToggle />
        <Editor />
      </div>
      <InstallPrompt />
    </div>
  );
}

export default function App() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [lang, setLang] = useState<'no' | 'en'>('no');

  useEffect(() => {
    const init = async () => {
      await initCrypto();

      // Check stored language preference
      const storedLang = localStorage.getItem('skrive-lang');
      if (storedLang === 'en' || storedLang === 'no') {
        setLang(storedLang);
      }

      // Check if already unlocked (key in memory from URL fragment)
      if (getMasterKey() && !needsPasswordUnlock()) {
        setIsUnlocked(true);
      }

      setIsInitialized(true);
    };

    init();
  }, []);

  const handleUnlocked = () => {
    setIsUnlocked(true);
  };

  // Show loading while initializing
  if (!isInitialized) {
    return (
      <div className="app-loading">
        <div className="app-loading-spinner" />
      </div>
    );
  }

  // Show password prompt if not unlocked
  if (!isUnlocked) {
    return <PasswordPrompt onUnlocked={handleUnlocked} lang={lang} />;
  }

  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
