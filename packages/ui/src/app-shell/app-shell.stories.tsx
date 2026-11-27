import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComponentPropsWithRef } from 'react';
import { expect } from 'storybook/test';
import { Button, LinkButton } from '../button/button.tsx';
import { AppNav, isCurrentPlace, type Place } from './app-nav.tsx';
import { AppShell, TopBar } from './app-shell.tsx';

const places: Place[] = [
  { href: '/', label: 'Home', icon: 'house' },
  { href: '/notes', label: 'Notes', icon: 'notebook-pen' },
  { href: '/account', label: 'Account', icon: 'circle-user' },
];

function RouterLink({ href, ...props }: ComponentPropsWithRef<'a'>) {
  return <a {...props} href={`#${href}`} data-router="demo" />;
}

function routerLink(place: Place) {
  return <RouterLink href={place.href} />;
}

function Page() {
  return (
    <div
      style={{
        display: 'grid',
        gap: 'var(--ds-space-3)',
        padding: 'var(--ds-space-6) var(--ds-space-4)',
      }}
    >
      <h1>Notes</h1>
      <p>Plan the launch on 2026-12-04, write the release notes and book the venue.</p>
    </div>
  );
}

function Demo({
  pathname,
  label = 'Main',
}: {
  readonly pathname: string;
  readonly label?: string;
}) {
  return (
    <AppShell
      skipLinkLabel="Skip to content"
      topBar={
        <TopBar
          start={
            <LinkButton href="#home" variant="ghost" tone="neutral">
              Notebook
            </LinkButton>
          }
          end={
            <Button size="sm" variant="ghost" tone="neutral">
              English
            </Button>
          }
        />
      }
      nav={<AppNav label={label} places={places} pathname={pathname} renderLink={routerLink} />}
    >
      <Page />
    </AppShell>
  );
}

const meta = {
  title: 'Components/AppShell',
  component: AppShell,
  args: { skipLinkLabel: 'Skip to content', children: <Page /> },
  parameters: {
    layout: 'fullscreen',
    docs: { story: { inline: false, iframeHeight: 520 } },
  },
} satisfies Meta<typeof AppShell>;

export default meta;

type Story = StoryObj<typeof meta>;

function boxes(canvasElement: HTMLElement) {
  const nav = canvasElement.querySelector('nav');
  const main = canvasElement.querySelector('main');
  if (!nav || !main) throw new Error('The shell lost its nav or its main');
  return { nav: nav.getBoundingClientRect(), main: main.getBoundingClientRect() };
}

export const Phone: Story = {
  globals: { viewport: { value: 'phone', isRotated: false } },
  render: () => <Demo pathname="/notes/42" />,
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole('link', { name: 'Notes' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(canvas.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
    await expect(canvas.getByRole('link', { name: 'Notes' })).toHaveAttribute(
      'data-router',
      'demo'
    );
    await expect(canvas.getByRole('link', { name: 'Notes' })).toHaveAttribute('href', '#/notes');
    const { nav, main } = boxes(canvasElement);
    await expect(nav.top).toBeGreaterThanOrEqual(main.bottom - 1);
    await expect(nav.bottom).toBeCloseTo(window.innerHeight, 0);
    await expect(nav.width).toBeCloseTo(window.innerWidth, 0);
  },
};

export const Tablet: Story = {
  globals: { viewport: { value: 'tablet', isRotated: false } },
  render: () => <Demo pathname="/" />,
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(canvas.getByRole('link', { name: 'Notes' })).not.toHaveAttribute('aria-current');
    const { nav, main } = boxes(canvasElement);
    await expect(nav.right).toBeLessThanOrEqual(main.left + 1);
    await expect(nav.height).toBeCloseTo(window.innerHeight, 0);
  },
};

export const Computer: Story = {
  globals: { viewport: { value: 'computer', isRotated: false } },
  render: () => <Demo pathname="/account" label="Principal" />,
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole('navigation', { name: 'Principal' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Account' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    const { nav, main } = boxes(canvasElement);
    await expect(nav.right).toBeLessThanOrEqual(main.left + 1);
    await expect(main.width).toBeGreaterThan(window.innerWidth / 2);
  },
};

export const SkipLink: Story = {
  render: () => <Demo pathname="/notes" />,
  play: async ({ canvas, userEvent }) => {
    const skip = canvas.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toHaveAttribute('href', '#main');
    await expect(skip.getBoundingClientRect().bottom).toBeLessThanOrEqual(0);
    await userEvent.tab();
    await expect(skip).toHaveFocus();
    await expect(skip.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
    const main = canvas.getByRole('main');
    await expect(main).toHaveAttribute('id', 'main');
    await expect(main).toHaveAttribute('tabindex', '-1');
  },
};

export const PlainLinks: Story = {
  render: () => (
    <AppShell
      skipLinkLabel="Skip to content"
      mainId="content"
      className="story-shell"
      nav={
        <AppNav
          label="Sections"
          places={places.map((place) => ({ ...place, href: `#${place.label.toLowerCase()}` }))}
          pathname="#notes"
          className="story-nav"
        />
      }
    >
      <Page />
    </AppShell>
  ),
  play: async ({ canvas, canvasElement }) => {
    await expect(canvasElement.querySelector('.ds-app-shell')).toHaveClass('story-shell');
    await expect(canvas.getByRole('link', { name: 'Skip to content' })).toHaveAttribute(
      'href',
      '#content'
    );
    await expect(canvas.queryByRole('banner')).toBeNull();
    const notes = canvas.getByRole('link', { name: 'Notes' });
    await expect(notes).toHaveAttribute('href', '#notes');
    await expect(notes).toHaveAttribute('aria-current', 'page');
    await expect(notes).not.toHaveAttribute('data-router');
    await expect(canvas.getByRole('navigation', { name: 'Sections' })).toHaveClass('story-nav');
  },
};

export const TopBarAlone: Story = {
  render: () => (
    <AppShell
      skipLinkLabel="Skip to content"
      topBar={
        <TopBar
          className="story-top-bar"
          start={
            <LinkButton href="#home" variant="ghost" tone="neutral">
              Notebook
            </LinkButton>
          }
        />
      }
    >
      <Page />
    </AppShell>
  ),
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole('banner')).toHaveClass('story-top-bar');
    await expect(canvasElement.querySelector('.ds-top-bar__end')).toBeNull();
    await expect(canvas.queryByRole('navigation')).toBeNull();
  },
};

export const CurrentPlace: Story = {
  render: () => <Demo pathname="/" />,
  play: async () => {
    await expect(isCurrentPlace('/', '/')).toBe(true);
    await expect(isCurrentPlace('/', '/notes')).toBe(false);
    await expect(isCurrentPlace('/notes', '/notes')).toBe(true);
    await expect(isCurrentPlace('/notes', '/notes/42')).toBe(true);
    await expect(isCurrentPlace('/notes', '/notebook')).toBe(false);
  },
};
