export const locales = ['en', 'es'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export function pickLocale(preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    const language = tag.toLowerCase().split(/[-_]/)[0];
    const found = locales.find((locale) => locale === language);
    if (found !== undefined) {
      return found;
    }
  }
  return defaultLocale;
}

export function deviceLocale(): Locale {
  return pickLocale([Intl.DateTimeFormat().resolvedOptions().locale]);
}
