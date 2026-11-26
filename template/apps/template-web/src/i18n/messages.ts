import en from '../../messages/en.json' with { type: 'json' };
import es from '../../messages/es.json' with { type: 'json' };
import type { Locale } from './locales.ts';

export type Messages = typeof en;

const byLocale = { en, es } satisfies Record<Locale, Messages>;

export function messagesOf(locale: Locale): Messages {
  return byLocale[locale];
}

declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}
