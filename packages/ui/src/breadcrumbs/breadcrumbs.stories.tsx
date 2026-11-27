import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComponentPropsWithRef } from 'react';
import { renderToString } from 'react-dom/server';
import { expect } from 'storybook/test';
import type { PageLink } from '../places/places.ts';
import { Breadcrumbs } from './breadcrumbs.tsx';

const links: PageLink[] = [
  { href: '/strategies', label: 'Strategies' },
  { href: '/strategies/mean-reversion', label: 'Mean reversion' },
];

function RouterLink(props: ComponentPropsWithRef<'a'>) {
  return <a {...props} data-router="demo" />;
}

function routerLink(link: PageLink) {
  return <RouterLink href={`#${link.href}`} className="story-link" />;
}

const meta = {
  title: 'Components/Breadcrumbs',
  component: Breadcrumbs,
  args: { label: 'Breadcrumb', links, current: 'Run 42' },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Breadcrumbs>;

export default meta;

type Story = StoryObj<typeof meta>;

function partsOf(canvasElement: HTMLElement) {
  const backs = [...canvasElement.querySelectorAll('.ds-breadcrumbs__back')];
  const separators = [...canvasElement.querySelectorAll('.ds-breadcrumbs__separator')];
  return { backs, separators };
}

export const Computer: Story = {
  globals: { viewport: { value: 'computer', isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    const nav = canvas.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(nav.querySelector('ol')).not.toBeNull();
    const strategies = canvas.getByRole('link', { name: 'Strategies' });
    const strategy = canvas.getByRole('link', { name: 'Mean reversion' });
    await expect(strategies).toBeVisible();
    await expect(strategies).toHaveAttribute('href', '/strategies');
    await expect(strategy).toBeVisible();
    await expect(strategy).toHaveAttribute('href', '/strategies/mean-reversion');
    const current = canvas.getByText('Run 42');
    await expect(current).toBeVisible();
    await expect(current).toHaveAttribute('aria-current', 'page');
    const text = strategies.querySelector<HTMLElement>('.ds-breadcrumbs__text');
    if (!text) throw new Error('The crumb lost its text');
    await expect(getComputedStyle(text).textDecorationLine).toBe('underline');
    await expect(getComputedStyle(current).textDecorationLine).toBe('none');
    await expect(current.closest('a')).toBeNull();
    const { backs, separators } = partsOf(canvasElement);
    await expect(separators).toHaveLength(2);
    for (const separator of separators) await expect(separator).toBeVisible();
    for (const back of backs) await expect(back).not.toBeVisible();
    const middle = (box: DOMRect) => (box.top + box.bottom) / 2;
    await expect(middle(strategies.getBoundingClientRect())).toBeCloseTo(
      middle(current.getBoundingClientRect()),
      0
    );
  },
};

export const Phone: Story = {
  globals: { viewport: { value: 'phone', isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    const strategy = canvas.getByRole('link', { name: 'Mean reversion' });
    await expect(strategy).toBeVisible();
    await expect(canvas.queryByRole('link', { name: 'Strategies' })).toBeNull();
    await expect(canvas.getByText('Run 42')).not.toBeVisible();
    const back = strategy.querySelector('.ds-breadcrumbs__back');
    await expect(back).toBeVisible();
    const { separators } = partsOf(canvasElement);
    for (const separator of separators) await expect(separator).not.toBeVisible();
  },
};

export const RouterLinks: Story = {
  args: { renderLink: routerLink, className: 'story-trail' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('navigation', { name: 'Breadcrumb' })).toHaveClass('story-trail');
    const strategy = canvas.getByRole('link', { name: 'Mean reversion' });
    await expect(strategy).toHaveAttribute('href', '#/strategies/mean-reversion');
    await expect(strategy).toHaveAttribute('data-router', 'demo');
    await expect(strategy).toHaveClass('story-link');
    await expect(strategy).toHaveClass('ds-breadcrumbs__link');
  },
};

export const LongNames: Story = {
  globals: { viewport: { value: 'computer', isRotated: false } },
  args: {
    links: [
      { href: '/strategies', label: 'Strategies' },
      {
        href: '/strategies/mean-reversion',
        label: 'Mean reversion on the euro against the dollar, tuned for quiet markets',
      },
    ],
    current: 'Run 42, started on 2026-11-27 after the rates decision of the central bank',
  },
  play: async ({ canvas, canvasElement }) => {
    const strategy = canvas.getByRole('link', {
      name: 'Mean reversion on the euro against the dollar, tuned for quiet markets',
    });
    const text = strategy.querySelector<HTMLElement>('.ds-breadcrumbs__text');
    if (!text) throw new Error('The crumb lost its text');
    await expect(text.getBoundingClientRect().width).toBeLessThanOrEqual(192.5);
    await expect(text.scrollWidth).toBeGreaterThan(text.clientWidth);
    const current = canvas.getByText(/^Run 42/);
    await expect(current.scrollWidth).toBeLessThanOrEqual(current.clientWidth + 1);
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

export const TopLevel: Story = {
  args: { links: [], current: 'Strategies' },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.queryByRole('navigation')).toBeNull();
    await expect(canvasElement.querySelector('.ds-breadcrumbs')).toBeNull();
  },
};

export const ServerMarkup: Story = {
  play: async ({ args }) => {
    const html = renderToString(<Breadcrumbs {...args} renderLink={routerLink} />);
    await expect(html).toContain('<nav aria-label="Breadcrumb" class="ds-breadcrumbs">');
    await expect(html).toContain('aria-current="page"');
    await expect(html).toContain('class="story-link ds-breadcrumbs__link"');
    await expect(renderToString(<Breadcrumbs {...args} links={[]} />)).toBe('');
  },
};
