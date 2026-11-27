import { describe, expect, it } from 'vitest';
import { defaultLocale, deviceLocale, locales, pickLocale } from './locale';

describe('pickLocale', () => {
  it('takes the first language the app speaks, whatever the region', () => {
    expect(pickLocale(['es-ES'])).toBe('es');
    expect(pickLocale(['fr-FR', 'es_MX', 'en-GB'])).toBe('es');
    expect(pickLocale(['EN-us'])).toBe('en');
  });

  it('falls back to English for a language the app does not speak', () => {
    expect(pickLocale(['de-DE'])).toBe(defaultLocale);
    expect(pickLocale([])).toBe(defaultLocale);
  });
});

describe('deviceLocale', () => {
  it('reads the language of the device', () => {
    expect(locales).toContain(deviceLocale());
  });
});
