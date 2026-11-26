import { createTranslator } from 'next-intl';
import type { Locale } from '../src/i18n/locales.ts';
import { timeZone } from '../src/i18n/locales.ts';
import { messagesOf } from '../src/i18n/messages.ts';

export function textsIn(locale: Locale) {
  return createTranslator({ locale, messages: messagesOf(locale), timeZone });
}

export function asHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#x27;');
}
