import { useState } from 'react';
import {
  unlockWithPassword,
  setupPasswordEncryption,
  hasLegacyKeyStorage,
  migrateFromLegacyKey,
  isPasswordEncryptionSetup
} from '@/utils/crypto';
import { EncryptedIcon } from './Icons';

interface PasswordPromptProps {
  onUnlocked: () => void;
  lang: 'no' | 'en';
}

export function PasswordPrompt({ onUnlocked, lang }: PasswordPromptProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const isNewUser = !isPasswordEncryptionSetup() && !hasLegacyKeyStorage();
  const needsMigration = hasLegacyKeyStorage();

  const t = {
    no: {
      title: isNewUser ? 'Opprett passord' : 'Lås opp',
      subtitle: isNewUser
        ? 'Velg et passord for å beskytte notatene dine'
        : needsMigration
          ? 'Oppgrader til passordbasert kryptering'
          : 'Skriv inn passordet ditt for å låse opp',
      password: 'Passord',
      confirmPassword: 'Bekreft passord',
      unlock: isNewUser ? 'Opprett' : 'Lås opp',
      error: 'Feil passord',
      mismatch: 'Passordene stemmer ikke',
      tooShort: 'Passordet må være minst 8 tegn',
      migrationNote: 'Dine eksisterende notater vil bli re-kryptert med det nye passordet.',
      securityNote: 'Passordet lagres aldri - det brukes kun til å utlede krypteringsnøkkelen.'
    },
    en: {
      title: isNewUser ? 'Create Password' : 'Unlock',
      subtitle: isNewUser
        ? 'Choose a password to protect your notes'
        : needsMigration
          ? 'Upgrade to password-based encryption'
          : 'Enter your password to unlock',
      password: 'Password',
      confirmPassword: 'Confirm password',
      unlock: isNewUser ? 'Create' : 'Unlock',
      error: 'Wrong password',
      mismatch: 'Passwords do not match',
      tooShort: 'Password must be at least 8 characters',
      migrationNote: 'Your existing notes will be re-encrypted with the new password.',
      securityNote: 'The password is never stored - it is only used to derive the encryption key.'
    }
  }[lang];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Validate password length
      if (password.length < 8) {
        setError(t.tooShort);
        setIsLoading(false);
        return;
      }

      // For new users or migration, require password confirmation
      if (isNewUser || needsMigration) {
        if (password !== confirmPassword) {
          setError(t.mismatch);
          setIsLoading(false);
          return;
        }

        if (needsMigration) {
          // Migrate from legacy key storage
          const success = await migrateFromLegacyKey(password);
          if (success) {
            onUnlocked();
          } else {
            setError(t.error);
          }
        } else {
          // Set up new password encryption
          await setupPasswordEncryption(password);
          onUnlocked();
        }
      } else {
        // Verify existing password
        const success = await unlockWithPassword(password);
        if (success) {
          onUnlocked();
        } else {
          setError(t.error);
        }
      }
    } catch {
      setError(t.error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="password-prompt-overlay">
      <div className="password-prompt">
        <div className="password-prompt-icon">
          <EncryptedIcon size={48} />
        </div>
        <h1 className="password-prompt-title">{t.title}</h1>
        <p className="password-prompt-subtitle">{t.subtitle}</p>

        {needsMigration && (
          <p className="password-prompt-migration-note">{t.migrationNote}</p>
        )}

        <form onSubmit={handleSubmit} className="password-prompt-form">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t.password}
            className="password-prompt-input"
            autoFocus
            disabled={isLoading}
          />

          {(isNewUser || needsMigration) && (
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t.confirmPassword}
              className="password-prompt-input"
              disabled={isLoading}
            />
          )}

          {error && <p className="password-prompt-error">{error}</p>}

          <button
            type="submit"
            className="password-prompt-button"
            disabled={isLoading || !password}
          >
            {isLoading ? '...' : t.unlock}
          </button>
        </form>

        <p className="password-prompt-security-note">{t.securityNote}</p>
      </div>
    </div>
  );
}
