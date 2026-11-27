import type { Meta, StoryObj } from '@storybook/react-vite';
import { type ComponentPropsWithRef, useState } from 'react';
import { renderToString } from 'react-dom/server';
import { expect, fn, mocked, spyOn, waitFor, within } from 'storybook/test';
import { AppShell, TopBar } from '../app-shell/app-shell.tsx';
import { Breadcrumbs } from '../breadcrumbs/breadcrumbs.tsx';
import { LinkButton } from '../button/button.tsx';
import { NavDrawer } from '../nav-drawer/nav-drawer.tsx';
import { PageTabs } from '../page-tabs/page-tabs.tsx';
import type { PageLink, PlaceGroup } from '../places/places.ts';
import { SideNav } from './side-nav.tsx';
import { sideNavCookie, sideNavOpen } from './side-nav-cookie.ts';

const go = fn();

const groups: PlaceGroup[] = [
  {
    label: 'Write',
    places: [
      { href: '/', label: 'Home', icon: 'house' },
      { href: '/notes', label: 'Notes', icon: 'notebook-pen' },
      { href: '/search', label: 'Search', icon: 'search' },
    ],
  },
  { label: 'Shared', places: [] },
  {
    label: 'You',
    places: [
      { href: '/account', label: 'Account', icon: 'circle-user' },
      { href: '/settings', label: 'Settings', icon: 'settings' },
      { href: '/language', label: 'Language', icon: 'languages' },
    ],
  },
];

const tabs: PageLink[] = [
  { href: '/notes/42', label: 'Text' },
  { href: '/notes/42/history', label: 'History' },
  { href: '/notes/42/sharing', label: 'Sharing' },
];

interface DemoLinkProps extends ComponentPropsWithRef<'a'> {
  readonly onGo: (href: string) => void;
}

function DemoLink({ href = '', onGo, onClick, ...props }: DemoLinkProps) {
  return (
    <a
      {...props}
      href={href}
      data-router="demo"
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
        onGo(href);
      }}
    />
  );
}

interface ConsoleProps {
  readonly start?: string;
  readonly defaultOpen?: boolean;
}

function Console({ start = '/notes/42/history', defaultOpen }: ConsoleProps) {
  const [pathname, setPathname] = useState(start);
  function visit(href: string) {
    go(href);
    setPathname(href);
  }
  function link(target: PageLink) {
    return <DemoLink href={target.href} onGo={visit} />;
  }
  return (
    <AppShell
      skipLinkLabel="Skip to content"
      topBar={
        <TopBar
          start={
            <>
              <NavDrawer
                label="Main"
                title="Notebook"
                menuLabel="Menu"
                closeLabel="Close"
                groups={groups}
                pathname={pathname}
                renderLink={link}
              />
              <LinkButton href="#home" variant="ghost" tone="neutral">
                Notebook
              </LinkButton>
            </>
          }
        />
      }
      nav={
        <SideNav
          label="Main"
          toggleLabel="Sidebar"
          groups={groups}
          pathname={pathname}
          defaultOpen={defaultOpen}
          renderLink={link}
        />
      }
    >
      <div
        style={{
          display: 'grid',
          gap: 'var(--ds-space-4)',
          padding: 'var(--ds-space-6) var(--ds-space-4)',
        }}
      >
        <Breadcrumbs
          label="Breadcrumb"
          links={[
            { href: '/notes', label: 'Notes' },
            { href: '/notes/42', label: 'Launch plan' },
          ]}
          current="History"
          renderLink={link}
        />
        <h1 style={{ margin: 0 }}>Launch plan</h1>
        <PageTabs label="Launch plan" tabs={tabs} pathname={pathname} renderLink={link} />
        <p>Book the venue on 2026-12-04, then write the release notes.</p>
      </div>
    </AppShell>
  );
}

const meta = {
  title: 'Components/SideNav',
  component: SideNav,
  args: { label: 'Main', toggleLabel: 'Sidebar', groups, pathname: '/notes/42/history' },
  parameters: {
    layout: 'fullscreen',
    docs: { story: { inline: false, iframeHeight: 560 } },
  },
  beforeEach: () => {
    go.mockClear();
    const set = spyOn(globalThis.cookieStore, 'set').mockResolvedValue(undefined);
    return () => set.mockRestore();
  },
} satisfies Meta<typeof SideNav>;

export default meta;

type Story = StoryObj<typeof meta>;

function sideNav(canvasElement: HTMLElement) {
  const nav = canvasElement.querySelector<HTMLElement>('.ds-side-nav');
  if (!nav) throw new Error('The side navigation is missing');
  return nav;
}

function widthOf(element: HTMLElement) {
  return element.getBoundingClientRect().width;
}

export const Tablet: Story = {
  globals: { viewport: { value: 'tablet', isRotated: false } },
  render: () => <Console />,
  play: async ({ canvas, canvasElement }) => {
    const nav = canvas.getByRole('navigation', { name: 'Main' });
    await expect(widthOf(nav)).toBeCloseTo(80, 0);
    await expect(canvas.queryByRole('button', { name: 'Sidebar' })).toBeNull();
    await expect(canvas.queryByRole('button', { name: 'Menu' })).toBeNull();
    await expect(canvas.getByRole('list', { name: 'Write' })).toBeVisible();
    await expect(canvas.getByRole('list', { name: 'You' })).toBeVisible();
    await expect(canvas.queryByRole('list', { name: 'Shared' })).toBeNull();
    await expect(canvas.getByText('Write')).not.toBeVisible();
    const notes = within(nav).getByRole('link', { name: 'Notes' });
    await expect(notes).toHaveAttribute('aria-current', 'page');
    await expect(notes).toHaveAttribute('href', '/notes');
    await expect(notes).toHaveAttribute('data-router', 'demo');
    await expect(within(nav).getByRole('link', { name: 'Home' })).not.toHaveAttribute(
      'aria-current'
    );
    const icon = notes.querySelector('.ds-nav-groups__icon');
    const label = notes.querySelector('.ds-nav-groups__label');
    if (!icon || !label) throw new Error('A place lost its icon or its label');
    await expect(label.getBoundingClientRect().top).toBeGreaterThan(
      icon.getBoundingClientRect().bottom - 1
    );
    await expect(sideNav(canvasElement)).not.toHaveAttribute('data-state');
    const main = canvas.getByRole('main');
    await expect(nav.getBoundingClientRect().right).toBeLessThanOrEqual(
      main.getBoundingClientRect().left + 1
    );
  },
};

export const SmallComputer: Story = {
  globals: { viewport: { value: 'laptop', isRotated: false } },
  render: () => <Console />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const nav = canvas.getByRole('navigation', { name: 'Main' });
    const toggle = canvas.getByRole('button', { name: 'Sidebar' });
    await expect(widthOf(nav)).toBeCloseTo(80, 0);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(canvas.getByText('Write')).not.toBeVisible();

    await userEvent.click(toggle);
    await waitFor(() => expect(widthOf(nav)).toBeCloseTo(256, 0));
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle).toHaveFocus();
    await expect(sideNav(canvasElement)).toHaveAttribute('data-state', 'open');
    await expect(canvas.getByText('Write')).toBeVisible();
    await expect(globalThis.cookieStore.set).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: sideNavCookie, value: 'open', path: '/', sameSite: 'lax' })
    );
    const notes = within(nav).getByRole('link', { name: 'Notes' });
    const icon = notes.querySelector('.ds-nav-groups__icon');
    const label = notes.querySelector('.ds-nav-groups__label');
    if (!icon || !label) throw new Error('A place lost its icon or its label');
    await expect(label.getBoundingClientRect().left).toBeGreaterThan(
      icon.getBoundingClientRect().right - 1
    );

    await userEvent.click(toggle);
    await waitFor(() => expect(widthOf(nav)).toBeCloseTo(80, 0));
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(sideNav(canvasElement)).toHaveAttribute('data-state', 'closed');
    await expect(globalThis.cookieStore.set).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: sideNavCookie, value: 'closed' })
    );
  },
};

export const Computer: Story = {
  globals: { viewport: { value: 'computer', isRotated: false } },
  render: () => <Console />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const nav = canvas.getByRole('navigation', { name: 'Main' });
    const toggle = canvas.getByRole('button', { name: 'Sidebar' });
    await expect(widthOf(nav)).toBeCloseTo(256, 0);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(sideNav(canvasElement)).not.toHaveAttribute('data-state');
    await expect(canvas.getByText('Write')).toBeVisible();
    await expect(canvas.getByText('You')).toBeVisible();
    const notes = within(nav).getByRole('link', { name: 'Notes' });
    await expect(notes.getBoundingClientRect().height).toBeGreaterThanOrEqual(40);

    await userEvent.click(within(nav).getByRole('link', { name: 'Settings' }));
    await expect(go).toHaveBeenCalledWith('/settings');
    await expect(within(nav).getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(within(nav).getByRole('link', { name: 'Notes' })).not.toHaveAttribute(
      'aria-current'
    );

    await userEvent.click(toggle);
    await waitFor(() => expect(widthOf(nav)).toBeCloseTo(80, 0));
    await expect(sideNav(canvasElement)).toHaveAttribute('data-state', 'closed');
    await expect(globalThis.cookieStore.set).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: sideNavCookie, value: 'closed' })
    );
  },
};

export const RememberedClosed: Story = {
  globals: { viewport: { value: 'computer', isRotated: false } },
  render: () => <Console defaultOpen={false} />,
  play: async ({ canvas, canvasElement }) => {
    const nav = canvas.getByRole('navigation', { name: 'Main' });
    await expect(widthOf(nav)).toBeCloseTo(80, 0);
    await expect(sideNav(canvasElement)).toHaveAttribute('data-state', 'closed');
    await expect(canvas.getByRole('button', { name: 'Sidebar' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    await expect(globalThis.cookieStore.set).not.toHaveBeenCalled();
  },
};

export const RememberedOpen: Story = {
  globals: { viewport: { value: 'laptop', isRotated: false } },
  render: () => <Console defaultOpen />,
  play: async ({ canvas, canvasElement }) => {
    await expect(widthOf(canvas.getByRole('navigation', { name: 'Main' }))).toBeCloseTo(256, 0);
    await expect(sideNav(canvasElement)).toHaveAttribute('data-state', 'open');
    await expect(canvas.getByRole('button', { name: 'Sidebar' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  },
};

export const Phone: Story = {
  globals: { viewport: { value: 'phone', isRotated: false } },
  render: () => <Console />,
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.queryByRole('navigation', { name: 'Main' })).toBeNull();
    await expect(sideNav(canvasElement)).not.toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Menu' })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Sidebar' })).toBeNull();
  },
};

export const CookieStoreMissing: Story = {
  globals: { viewport: { value: 'computer', isRotated: false } },
  render: () => <Console />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const store = globalThis.cookieStore;
    const own = Object.getOwnPropertyDescriptor(globalThis, 'cookieStore');
    Object.defineProperty(globalThis, 'cookieStore', { configurable: true, value: undefined });
    try {
      await userEvent.click(canvas.getByRole('button', { name: 'Sidebar' }));
      await expect(sideNav(canvasElement)).toHaveAttribute('data-state', 'closed');
      await expect(store.set).not.toHaveBeenCalled();
    } finally {
      if (own) {
        Object.defineProperty(globalThis, 'cookieStore', own);
      } else {
        Reflect.deleteProperty(globalThis, 'cookieStore');
      }
    }
    await expect(globalThis.cookieStore).toBe(store);
  },
};

export const CookieRefused: Story = {
  globals: { viewport: { value: 'computer', isRotated: false } },
  render: () => <Console />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const set = mocked(globalThis.cookieStore.set);
    set.mockRejectedValueOnce(new Error('The browser refused the cookie'));
    await userEvent.click(canvas.getByRole('button', { name: 'Sidebar' }));
    await expect(sideNav(canvasElement)).toHaveAttribute('data-state', 'closed');
    await expect(set).toHaveBeenCalledTimes(1);
    await expect(set.mock.results[0]?.value).rejects.toThrow('The browser refused the cookie');
  },
};

export const ServerMarkup: Story = {
  play: async ({ args }) => {
    const unknown = renderToString(<SideNav {...args} />);
    await expect(unknown).not.toContain('data-state');
    await expect(unknown).toContain('aria-expanded="true"');
    await expect(unknown).toContain('aria-current="page"');
    const closed = renderToString(<SideNav {...args} defaultOpen={false} />);
    await expect(closed).toContain('data-state="closed"');
    await expect(closed).toContain('aria-expanded="false"');
    const drawer = renderToString(
      <NavDrawer
        label="Main"
        title="Notebook"
        menuLabel="Menu"
        closeLabel="Close"
        groups={groups}
        pathname="/notes"
      />
    );
    await expect(drawer).toContain('aria-label="Menu"');
    await expect(drawer).not.toContain('role="dialog"');
    await expect(drawer).not.toContain('Settings');
    await expect(sideNavOpen('open')).toBe(true);
    await expect(sideNavOpen('closed')).toBe(false);
    await expect(sideNavOpen('wide')).toBeUndefined();
    await expect(sideNavOpen(undefined)).toBeUndefined();
  },
};
