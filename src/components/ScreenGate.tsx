import { useMediaQuery } from '@/hooks/useMediaQuery';
import { i18n } from '@/utils/i18n';

// Full-screen notice shown instead of (or covering) the app on screens
// that are too small. Language comes from the browser because the gate
// can render before any stored app state is available. No wordmark:
// the title already starts with the app name
export function ScreenGate() {
  const touch = useMediaQuery('(pointer: coarse)');
  const lang = navigator.language.toLowerCase().startsWith('en') ? 'en' : 'no';
  const t = i18n[lang];

  return (
    <div className="screen-gate">
      <h1>{t.screenGateTitle}</h1>
      <p>{touch ? t.screenGateTouchBody : t.screenGateWindowBody}</p>
    </div>
  );
}
