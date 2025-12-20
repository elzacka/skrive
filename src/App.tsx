import { AppProvider } from '@/contexts';
import { Sidebar, Editor, SidebarToggle, InstallPrompt } from '@/components';
import { useKeyboardShortcuts } from '@/hooks';
import '@/styles/main.css';

function AppContent() {
  useKeyboardShortcuts();

  return (
    <div className="app">
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
