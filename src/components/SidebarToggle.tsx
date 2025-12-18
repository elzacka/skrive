import { useApp } from '@/contexts';
import { ChevronLeftIcon, ChevronRightIcon } from './Icons';

export function SidebarToggle() {
  const { state, toggleSidebar } = useApp();
  const label = state.sidebarVisible
    ? (state.lang === 'no' ? 'Skjul meny' : 'Hide sidebar')
    : (state.lang === 'no' ? 'Vis meny' : 'Show sidebar');

  return (
    <button
      className="sidebar-toggle"
      onClick={toggleSidebar}
      aria-label={label}
      title={label}
    >
      {state.sidebarVisible ? <ChevronLeftIcon size={20} /> : <ChevronRightIcon size={20} />}
    </button>
  );
}
