import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { cleanup, render } from '../../test/render.tsx';
import { textsIn } from '../../test/texts.ts';
import type { Locale } from '../i18n/locales.ts';
import { Palette } from './palette.client.tsx';

const router = vi.hoisted(() => ({ push: vi.fn() }));
const language = vi.hoisted(() => ({ chooseLanguage: vi.fn(async (_form: FormData) => {}) }));

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('./language.ts', () => language);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function propsIn(locale: Locale) {
  const t = textsIn(locale);
  return {
    locale,
    places: [
      { href: '/', label: t('nav.home'), icon: 'house' },
      { href: '/notes', label: t('nav.notes'), icon: 'notebook-pen' },
      { href: '/account', label: t('nav.account'), icon: 'circle-user' },
    ] as const,
    languages: { en: t('language.en'), es: t('language.es') },
    texts: {
      label: t('palette.label'),
      placeholder: t('palette.placeholder'),
      empty: t('palette.empty'),
      close: t('palette.close'),
      places: t('palette.places'),
      language: t('language.label'),
    },
  };
}

describe('the command palette', () => {
  it('opens with the shortcut, finds a place and goes there through the router', async () => {
    const t = textsIn('en');
    await render(<Palette {...propsIn('en')} />);

    await userEvent.keyboard('{Control>}k{/Control}');

    const dialog = page.getByRole('dialog', { name: t('palette.label') });
    await expect.element(dialog).toBeVisible();
    const input = dialog.getByRole('combobox', { name: t('palette.label') });
    await expect.element(input).toHaveFocus();
    await expect.element(dialog.getByRole('group', { name: t('palette.places') })).toBeVisible();
    await expect.element(dialog.getByRole('group', { name: t('language.label') })).toBeVisible();
    await userEvent.type(input, 'not');
    await expect.element(dialog.getByRole('option', { name: t('nav.notes') })).toBeVisible();
    await expect
      .element(dialog.getByRole('option', { name: t('nav.home') }))
      .not.toBeInTheDocument();
    await userEvent.keyboard('{Enter}');

    expect(router.push).toHaveBeenCalledWith('/notes');
    await expect.element(dialog).not.toBeInTheDocument();
    expect(language.chooseLanguage).not.toHaveBeenCalled();
  });

  it('offers the other language only, in Spanish, and switches through the server action', async () => {
    const t = textsIn('es');
    await render(<Palette {...propsIn('es')} />, 'es');

    await userEvent.click(page.getByRole('button', { name: t('palette.label') }));

    const dialog = page.getByRole('dialog', { name: t('palette.label') });
    const english = dialog.getByRole('option', { name: t('language.en') });
    await expect.element(english).toBeVisible();
    await expect.element(english.getByText(t('language.en'))).toHaveAttribute('lang', 'en');
    await expect
      .element(dialog.getByRole('option', { name: t('language.es') }))
      .not.toBeInTheDocument();
    await userEvent.type(dialog.getByRole('combobox'), t('language.label'));
    await expect.element(english).toHaveAttribute('data-highlighted');
    await userEvent.keyboard('{Enter}');

    await vi.waitFor(() => expect(language.chooseLanguage).toHaveBeenCalledOnce());
    expect(language.chooseLanguage.mock.calls[0]?.[0].get('locale')).toBe('en');
    expect(router.push).not.toHaveBeenCalled();
  });
});
