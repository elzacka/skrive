import { i18n } from '@/utils/i18n';

// Shown while Skrive is open in another window. Language comes from the
// browser: no app state is loaded yet
export function InstanceGate() {
  const t = i18n[navigator.language.toLowerCase().startsWith('en') ? 'en' : 'no'];
  return (
    <div className="screen-gate">
      <h1>{t.instanceGateTitle}</h1>
      <p>{t.instanceGateBody}</p>
    </div>
  );
}
