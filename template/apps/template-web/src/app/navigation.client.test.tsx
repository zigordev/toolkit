import type { ComponentPropsWithRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { cleanup, render } from '../../test/render.tsx';
import { textsIn } from '../../test/texts.ts';
import { Navigation } from './navigation.client.tsx';

const route = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));
vi.mock('../lib/link.ts', () => ({
  Link: (props: ComponentPropsWithRef<'a'>) => <a {...props} data-next-link="" />,
}));

afterEach(() => {
  cleanup();
});

function placesIn(locale: 'en' | 'es') {
  const t = textsIn(locale);
  return {
    label: t('nav.label'),
    places: [
      { href: '/', label: t('nav.home'), icon: 'house' },
      { href: '/notes', label: t('nav.notes'), icon: 'notebook-pen' },
      { href: '/account', label: t('nav.account'), icon: 'circle-user' },
    ] as const,
  };
}

describe('the main navigation', () => {
  it('marks the place of the page shown, deeper pages included, with links of the router', async () => {
    route.pathname = '/notes/01938c2e-0000-7000-8000-0000000000aa';
    const { label, places } = placesIn('en');
    const t = textsIn('en');

    await render(<Navigation label={label} places={places} />);

    const nav = page.getByRole('navigation', { name: t('nav.label') });
    await expect.element(nav).toBeVisible();
    const notes = nav.getByRole('link', { name: t('nav.notes') });
    await expect.element(notes).toHaveAttribute('aria-current', 'page');
    await expect.element(notes).toHaveAttribute('href', '/notes');
    await expect.element(notes).toHaveAttribute('data-next-link');
    await expect
      .element(nav.getByRole('link', { name: t('nav.home') }))
      .not.toHaveAttribute('aria-current');
  });

  it('marks the start page only on the start page, in Spanish too', async () => {
    route.pathname = '/';
    const { label, places } = placesIn('es');
    const t = textsIn('es');

    await render(<Navigation label={label} places={places} />, 'es');

    const nav = page.getByRole('navigation', { name: t('nav.label') });
    await expect
      .element(nav.getByRole('link', { name: t('nav.home') }))
      .toHaveAttribute('aria-current', 'page');
    await expect
      .element(nav.getByRole('link', { name: t('nav.account') }))
      .not.toHaveAttribute('aria-current');
  });
});
