import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComponentPropsWithRef } from 'react';
import { expect, waitFor } from 'storybook/test';
import type { PageLink } from '../places/places.ts';
import { PageTabs, scrollToShow } from './page-tabs.tsx';

const tabs: PageLink[] = [
  { href: '/strategies/mean-reversion', label: 'Overview' },
  { href: '/strategies/mean-reversion/runs', label: 'Runs' },
  { href: '/strategies/mean-reversion/orders', label: 'Orders' },
  { href: '/strategies/mean-reversion/settings', label: 'Settings' },
];

const manyTabs: PageLink[] = [
  ...tabs,
  { href: '/strategies/mean-reversion/backtests', label: 'Backtests' },
  { href: '/strategies/mean-reversion/alerts', label: 'Alerts' },
  { href: '/strategies/mean-reversion/history', label: 'Change history' },
  { href: '/strategies/mean-reversion/sharing', label: 'Sharing' },
];

function RouterLink(props: ComponentPropsWithRef<'a'>) {
  return <a {...props} data-router="demo" />;
}

function routerLink(link: PageLink) {
  return <RouterLink href={`#${link.href}`} />;
}

const meta = {
  title: 'Components/PageTabs',
  component: PageTabs,
  args: { label: 'Mean reversion', tabs, pathname: '/strategies/mean-reversion/runs/42' },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof PageTabs>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Computer: Story = {
  globals: { viewport: { value: 'computer', isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('navigation', { name: 'Mean reversion' })).toBeVisible();
    await expect(canvas.queryByRole('tab')).toBeNull();
    const runs = canvas.getByRole('link', { name: 'Runs' });
    await expect(runs).toHaveAttribute('aria-current', 'page');
    await expect(runs).toHaveAttribute('href', '/strategies/mean-reversion/runs');
    await expect(canvas.getByRole('link', { name: 'Overview' })).not.toHaveAttribute(
      'aria-current'
    );
    await expect(getComputedStyle(runs, '::after').content).toBe('""');
    await expect(
      getComputedStyle(canvas.getByRole('link', { name: 'Orders' }), '::after').content
    ).toBe('none');
    await expect(runs.getBoundingClientRect().height).toBeGreaterThanOrEqual(48);
  },
};

export const FirstTab: Story = {
  args: { pathname: '/strategies/mean-reversion' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(canvas.getByRole('link', { name: 'Runs' })).not.toHaveAttribute('aria-current');
  },
};

export const NoTabMatches: Story = {
  args: { pathname: '/strategies/momentum' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[aria-current]')).toBeNull();
  },
};

export const PhoneShowsTheCurrentTab: Story = {
  globals: { viewport: { value: 'phone', isRotated: false } },
  args: { tabs: manyTabs, pathname: '/strategies/mean-reversion/history' },
  play: async ({ canvas, canvasElement }) => {
    const list = canvasElement.querySelector<HTMLElement>('.ds-page-tabs__list');
    if (!list) throw new Error('The tabs lost their list');
    await expect(list.scrollWidth).toBeGreaterThan(list.clientWidth);
    const current = canvas.getByRole('link', { name: 'Change history' });
    await waitFor(() => expect(list.scrollLeft).toBeGreaterThan(0));
    const shown = list.getBoundingClientRect();
    const tab = current.getBoundingClientRect();
    await expect(tab.left).toBeGreaterThanOrEqual(shown.left - 1);
    await expect(tab.right).toBeLessThanOrEqual(shown.right + 1);
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

export const RouterLinks: Story = {
  args: { renderLink: routerLink, className: 'story-tabs' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('navigation', { name: 'Mean reversion' })).toHaveClass(
      'story-tabs'
    );
    const runs = canvas.getByRole('link', { name: 'Runs' });
    await expect(runs).toHaveAttribute('href', '#/strategies/mean-reversion/runs');
    await expect(runs).toHaveAttribute('data-router', 'demo');
    await expect(runs).toHaveAttribute('aria-current', 'page');
  },
};

export const ScrollMath: Story = {
  play: async () => {
    await expect(scrollToShow(0, 300, 100, 80)).toBe(0);
    await expect(scrollToShow(0, 300, 280, 80)).toBe(60);
    await expect(scrollToShow(200, 300, 120, 80)).toBe(120);
    await expect(scrollToShow(0, 300, 400, 500)).toBe(400);
  },
};
