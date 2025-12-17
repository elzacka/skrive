import { useApp } from '@/contexts';

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z" />
    </svg>
  );
}

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
      {state.sidebarVisible ? <ChevronLeftIcon /> : <ChevronRightIcon />}
    </button>
  );
}
