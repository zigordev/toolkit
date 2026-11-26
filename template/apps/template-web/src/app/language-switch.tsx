import type { Locale } from '../i18n/locales.ts';
import { chooseLanguage } from './language.ts';

export interface LanguageSwitchProps {
  readonly current: Locale;
  readonly label: string;
  readonly names: Readonly<Record<Locale, string>>;
}

export function LanguageSwitch({ current, label, names }: LanguageSwitchProps) {
  return (
    <nav aria-label={label}>
      <form action={chooseLanguage}>
        <button type="submit" name="locale" value="en" lang="en" aria-pressed={current === 'en'}>
          {names.en}
        </button>
        <button type="submit" name="locale" value="es" lang="es" aria-pressed={current === 'es'}>
          {names.es}
        </button>
      </form>
    </nav>
  );
}
