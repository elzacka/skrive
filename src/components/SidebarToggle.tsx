import { useApp } from '@/contexts';
import { i18n } from '@/utils/i18n';
import { ChevronLeftIcon, ChevronRightIcon } from './Icons';

export function SidebarToggle() {
  const { state, toggleSidebar } = useApp();
  const t = i18n[state.lang];
  const label = state.sidebarVisible ? t.hideSidebar : t.showSidebar;

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
