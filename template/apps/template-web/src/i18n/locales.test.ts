import { describe, expect, it } from 'vitest';
import { chooseLocale, defaultLocale, isLocale } from './locales.ts';

describe('isLocale', () => {
  it('knows English and Spanish, by their short tags, and nothing else', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('es')).toBe(true);
    expect(isLocale('es-ES')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(7)).toBe(false);
  });
});

describe('chooseLocale', () => {
  it('takes the language the person chose, before anything the browser says', () => {
    expect(chooseLocale('es', 'en-GB,en;q=0.9')).toBe('es');
  });

  it("follows the browser's preference by weight, then by order, matching the language alone", () => {
    expect(chooseLocale(undefined, 'es-ES,es;q=0.9,en;q=0.8')).toBe('es');
    expect(chooseLocale(undefined, 'de-DE, en;q=0.5, es;q=0.7')).toBe('es');
    expect(chooseLocale(undefined, 'fr, EN-US, es')).toBe('en');
  });

  it('ignores a language the browser refuses, a broken weight and a choice it does not know', () => {
    expect(chooseLocale('fr', 'es;q=0, en;q=0.1')).toBe('en');
    expect(chooseLocale(undefined, 'es;q=x, en')).toBe('en');
  });

  it('falls back to English', () => {
    expect(defaultLocale).toBe('en');
    expect(chooseLocale(undefined, null)).toBe('en');
    expect(chooseLocale(undefined, 'fr-FR,de;q=0.8,*;q=0.1')).toBe('en');
  });
});
