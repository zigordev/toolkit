import { afterEach, describe, expect, it, vi } from 'vitest';
import { chooseLanguage } from './language.ts';

const jar = vi.hoisted(() => ({ set: vi.fn() }));

vi.mock('next/headers', () => ({ cookies: async () => jar }));

function form(locale: string): FormData {
  const data = new FormData();
  data.set('locale', locale);
  return data;
}

afterEach(() => {
  jar.set.mockClear();
});

describe('choosing a language', () => {
  it('keeps the choice in a cookie for a year, which the page reads on the next render', async () => {
    await chooseLanguage(form('es'));

    expect(jar.set).toHaveBeenCalledWith('template.locale', 'es', {
      path: '/',
      maxAge: 31_536_000,
      sameSite: 'lax',
      httpOnly: true,
    });
  });

  it('ignores a language it does not know', async () => {
    await chooseLanguage(form('fr'));

    expect(jar.set).not.toHaveBeenCalled();
  });
});
