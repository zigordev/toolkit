export const locales = ['en', 'es'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export const localeCookie = 'template.locale';

export const timeZone = 'UTC';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

interface Preference {
  readonly language: string;
  readonly weight: number;
  readonly order: number;
}

function preferenceOf(part: string, order: number): Preference {
  const [tag = '', ...parameters] = part.split(';').map((piece) => piece.trim());
  const quality = parameters.find((parameter) => parameter.startsWith('q='));
  const weight = quality === undefined ? 1 : Number(quality.slice(2));
  return {
    language: tag.split('-')[0]?.toLowerCase() ?? '',
    weight: Number.isFinite(weight) ? weight : 0,
    order,
  };
}

export function chooseLocale(chosen: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(chosen)) {
    return chosen;
  }
  const preferences = (acceptLanguage ?? '')
    .split(',')
    .map(preferenceOf)
    .filter((preference) => preference.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.order - b.order);
  return (
    (preferences.find((preference) => isLocale(preference.language))?.language as
      | Locale
      | undefined) ?? defaultLocale
  );
}
