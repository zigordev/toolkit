import type { Meta, StoryObj } from '@storybook/react-vite';
import { type ComponentPropsWithRef, useState } from 'react';
import { expect, fn, screen, waitFor, within } from 'storybook/test';
import { TopBar } from '../app-shell/app-shell.tsx';
import { Button, LinkButton } from '../button/button.tsx';
import type { PageLink, PlaceGroup } from '../places/places.ts';
import { NavDrawer } from './nav-drawer.tsx';

const go = fn();

const groups: PlaceGroup[] = [
  {
    places: [{ href: '/', label: 'Home', icon: 'house' }],
  },
  {
    label: 'Write',
    places: [
      { href: '/notes', label: 'Notes', icon: 'notebook-pen' },
      { href: '/search', label: 'Search', icon: 'search' },
    ],
  },
  {
    label: 'You',
    places: [
      { href: '/account', label: 'Account', icon: 'circle-user' },
      { href: '/settings', label: 'Settings', icon: 'settings' },
    ],
  },
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

function Phone({ start = '/notes/42' }: { readonly start?: string }) {
  const [pathname, setPathname] = useState(start);
  function visit(href: string) {
    go(href);
    setPathname(href);
  }
  function link(target: PageLink) {
    return <DemoLink href={target.href} onGo={visit} />;
  }
  return (
    <>
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
      <p style={{ padding: 'var(--ds-space-4)' }}>Shown: {pathname}</p>
      <Button variant="ghost" tone="neutral" onClick={() => setPathname('/account')}>
        Go back in history
      </Button>
    </>
  );
}

const meta = {
  title: 'Components/NavDrawer',
  component: NavDrawer,
  args: {
    label: 'Main',
    title: 'Notebook',
    menuLabel: 'Menu',
    closeLabel: 'Close',
    groups,
    pathname: '/notes/42',
  },
  globals: { viewport: { value: 'phone', isRotated: false } },
  parameters: {
    layout: 'fullscreen',
    docs: { story: { inline: false, iframeHeight: 640 } },
  },
  beforeEach: () => {
    go.mockClear();
  },
} satisfies Meta<typeof NavDrawer>;

export default meta;

type Story = StoryObj<typeof meta>;

async function opened() {
  const drawer = await screen.findByRole('dialog', { name: 'Notebook' });
  await waitFor(() => expect(drawer).not.toHaveAttribute('data-starting-style'));
  await waitFor(() => expect(document.getAnimations()).toHaveLength(0));
  await waitFor(() => expect(drawer).toBeVisible());
  return drawer;
}

async function closed() {
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

export const OpenAndClose: Story = {
  render: () => <Phone />,
  play: async ({ canvas, userEvent }) => {
    const menu = canvas.getByRole('button', { name: 'Menu' });
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(menu.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
    await userEvent.click(menu);
    const drawer = await opened();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    const nav = within(drawer).getByRole('navigation', { name: 'Main' });
    await expect(within(nav).getByRole('list', { name: 'Write' })).toBeVisible();
    await expect(within(nav).getByRole('list', { name: 'You' })).toBeVisible();
    await expect(within(nav).getByText('Write')).toBeVisible();
    const notes = within(nav).getByRole('link', { name: 'Notes' });
    await expect(notes).toHaveAttribute('aria-current', 'page');
    await expect(notes.getBoundingClientRect().height).toBeGreaterThanOrEqual(48);
    await expect(within(nav).getByRole('link', { name: 'Home' })).not.toHaveAttribute(
      'aria-current'
    );
    const box = drawer.getBoundingClientRect();
    await expect(box.left).toBeCloseTo(0, 0);
    await expect(box.height).toBeCloseTo(window.innerHeight, 0);
    await expect(box.width).toBeLessThanOrEqual(window.innerWidth - 48);
    await waitFor(() => expect(drawer.contains(document.activeElement)).toBe(true));

    await userEvent.keyboard('{Escape}');
    await closed();
    await expect(menu).toHaveFocus();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
  },
};

export const GoSomewhere: Story = {
  render: () => <Phone />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Menu' }));
    const drawer = await opened();
    await userEvent.click(within(drawer).getByRole('link', { name: 'Settings' }));
    await expect(go).toHaveBeenCalledWith('/settings');
    await closed();
    await expect(canvas.getByText('Shown: /settings')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Menu' }));
    const again = await opened();
    await expect(within(again).getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  },
};

export const CloseWithTheButtonOrOutside: Story = {
  render: () => <Phone />,
  play: async ({ canvas, userEvent }) => {
    const menu = canvas.getByRole('button', { name: 'Menu' });
    await userEvent.click(menu);
    const drawer = await opened();
    await userEvent.click(within(drawer).getByRole('button', { name: 'Close' }));
    await closed();
    await expect(menu).toHaveFocus();

    await userEvent.click(menu);
    await opened();
    const viewport = document.querySelector<HTMLElement>('.ds-nav-drawer__viewport');
    if (!viewport) throw new Error('The drawer has no viewport');
    await userEvent.click(viewport);
    await closed();
    await expect(go).not.toHaveBeenCalled();
  },
};

export const ClosesWhenTheAddressChanges: Story = {
  render: () => <Phone />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Menu' }));
    const drawer = await opened();
    const back = canvas.getByRole('button', { name: 'Go back in history', hidden: true });
    back.click();
    await closed();
    await expect(drawer).not.toBeInTheDocument();
    await expect(canvas.getByText('Shown: /account')).toBeVisible();
  },
};

export const StaysShutOnWiderScreens: Story = {
  globals: { viewport: { value: 'tablet', isRotated: false } },
  render: () => <Phone />,
  play: async ({ canvas, canvasElement }) => {
    const menu = canvasElement.querySelector<HTMLElement>('.ds-nav-drawer__trigger');
    if (!menu) throw new Error('The menu button is missing');
    await expect(menu).not.toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Menu' })).toBeNull();
    menu.click();
    await expect(screen.queryByRole('dialog')).toBeNull();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
  },
};

export const RouterLinks: Story = {
  args: { className: 'story-menu' },
  play: async ({ canvas, userEvent }) => {
    const menu = canvas.getByRole('button', { name: 'Menu' });
    await expect(menu).toHaveClass('story-menu');
    await userEvent.click(menu);
    const drawer = await opened();
    const notes = within(drawer).getByRole('link', { name: 'Notes' });
    await expect(notes).toHaveAttribute('href', '/notes');
    await expect(notes).not.toHaveAttribute('data-router');
    await expect(within(drawer).getAllByRole('list')).toHaveLength(3);
  },
};
