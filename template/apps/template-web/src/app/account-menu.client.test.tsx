import type { ComponentPropsWithRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { cleanup, render } from '../../test/render.tsx';
import { textsIn } from '../../test/texts.ts';
import type { Locale } from '../i18n/locales.ts';
import { Account } from './account-menu.client.tsx';

const actions = vi.hoisted(() => ({
  setLanguage: vi.fn(async (_locale: unknown) => {}),
  setMode: vi.fn(async (_mode: unknown) => {}),
  signOut: vi.fn(async (_client: unknown, _go: unknown) => {}),
}));

vi.mock('./language.ts', () => ({ setLanguage: actions.setLanguage }));
vi.mock('./mode.ts', () => ({ setMode: actions.setMode }));
vi.mock('../lib/sign-in.ts', () => ({ signOut: actions.signOut }));
vi.mock('../lib/auth-client.ts', () => ({ getAuthClient: () => 'the auth client' }));
vi.mock('../lib/link.ts', () => ({
  Link: (props: ComponentPropsWithRef<'a'>) => <a {...props} data-next-link="" />,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  delete document.documentElement.dataset.mode;
});

function propsIn(locale: Locale) {
  const t = textsIn(locale);
  return {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    locale,
    languages: { en: t('language.en'), es: t('language.es') },
    mode: 'system' as const,
    texts: {
      label: t('accountMenu.label', { name: 'Ada Lovelace' }),
      language: t('language.label'),
      appearance: t('accountMenu.appearance'),
      modes: {
        system: t('accountMenu.system'),
        light: t('accountMenu.light'),
        dark: t('accountMenu.dark'),
      },
      settings: t('accountMenu.settings'),
      signOut: t('account.signOut'),
    },
  };
}

async function open(label: string) {
  await userEvent.click(page.getByRole('button', { name: label }));
  const menu = page.getByRole('menu', { name: label });
  await expect.element(menu).toBeVisible();
  return menu;
}

describe('the account menu', () => {
  it('shows who is signed in, the language, the mode, the settings and the way out', async () => {
    const t = textsIn('en');
    await render(<Account {...propsIn('en')} />);

    const menu = await open(t('accountMenu.label', { name: 'Ada Lovelace' }));

    await expect.element(menu.getByText('ada@example.com')).toBeVisible();
    const language = menu.getByRole('group', { name: t('language.label') });
    await expect
      .element(language.getByRole('menuitemradio', { name: t('language.en') }))
      .toHaveAttribute('aria-checked', 'true');
    await expect
      .element(language.getByRole('menuitemradio', { name: t('language.es') }))
      .toHaveAttribute('aria-checked', 'false');
    const appearance = menu.getByRole('group', { name: t('accountMenu.appearance') });
    await expect
      .element(appearance.getByRole('menuitemradio', { name: t('accountMenu.system') }))
      .toHaveAttribute('aria-checked', 'true');
    const settings = menu.getByRole('menuitem', { name: t('accountMenu.settings') });
    await expect.element(settings).toHaveAttribute('href', '/account');
    await expect.element(settings).toHaveAttribute('data-next-link', '');
    await expect.element(menu.getByRole('menuitem', { name: t('account.signOut') })).toBeVisible();
  });

  it('turns the page dark at once and keeps the choice through the server action', async () => {
    const t = textsIn('en');
    await render(<Account {...propsIn('en')} />);
    await open(t('accountMenu.label', { name: 'Ada Lovelace' }));

    await userEvent.keyboard('{End}{ArrowUp}{ArrowUp}{Enter}');

    expect(document.documentElement.dataset.mode).toBe('dark');
    await vi.waitFor(() => expect(actions.setMode).toHaveBeenCalledWith('dark'));
    expect(actions.setLanguage).not.toHaveBeenCalled();
  });

  it('switches the language in Spanish, and signs out with the auth client', async () => {
    const t = textsIn('es');
    const label = t('accountMenu.label', { name: 'Ada Lovelace' });
    await render(<Account {...propsIn('es')} />, 'es');
    await open(label);

    await userEvent.keyboard('{Home}{Enter}');

    await vi.waitFor(() => expect(actions.setLanguage).toHaveBeenCalledWith('en'));

    const menu = await open(label);
    await expect.element(menu.getByRole('menuitem', { name: t('account.signOut') })).toBeVisible();
    await userEvent.keyboard('{End}{Enter}');

    await vi.waitFor(() => expect(actions.signOut).toHaveBeenCalledOnce());
    expect(actions.signOut.mock.calls[0]?.[0]).toBe('the auth client');
    expect(actions.setMode).not.toHaveBeenCalled();
  });
});
