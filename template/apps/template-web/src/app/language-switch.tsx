import { Button } from '@zigordev/ui';
import type { Locale } from '../i18n/locales.ts';
import { chooseLanguage } from './language.ts';
import styles from './layout.module.css';

export interface LanguageSwitchProps {
  readonly current: Locale;
  readonly label: string;
  readonly names: Readonly<Record<Locale, string>>;
}

export function LanguageSwitch({ current, label, names }: LanguageSwitchProps) {
  return (
    <nav aria-label={label}>
      <form action={chooseLanguage} className={styles.languages}>
        <Button
          type="submit"
          name="locale"
          value="en"
          lang="en"
          aria-pressed={current === 'en'}
          variant={current === 'en' ? 'soft' : 'ghost'}
          tone="neutral"
          size="sm"
        >
          {names.en}
        </Button>
        <Button
          type="submit"
          name="locale"
          value="es"
          lang="es"
          aria-pressed={current === 'es'}
          variant={current === 'es' ? 'soft' : 'ghost'}
          tone="neutral"
          size="sm"
        >
          {names.es}
        </Button>
      </form>
    </nav>
  );
}
