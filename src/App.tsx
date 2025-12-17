import { AppProvider } from '@/contexts';
import { Header, Sidebar, Editor, SidebarToggle, InstallPrompt } from '@/components';
import { useKeyboardShortcuts } from '@/hooks';
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
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
