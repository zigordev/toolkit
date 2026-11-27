import type { Meta, StoryObj } from '@storybook/react-vite';
import { type ComponentPropsWithRef, useState } from 'react';
import { renderToString } from 'react-dom/server';
import { expect, fn, screen, waitFor, within } from 'storybook/test';
import { AppShell, TopBar } from '../app-shell/app-shell.tsx';
import { Button, LinkButton } from '../button/button.tsx';
import type { PageLink } from '../places/places.ts';
import { HeaderNav, type HeaderNavProps } from './header-nav.tsx';

const go = fn();

const links: PageLink[] = [
  { href: '/', label: 'Work' },
  { href: '/case-studies', label: 'Case studies' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
];

const spanish: PageLink[] = [
  { href: '/', label: 'Trabajos recientes' },
  { href: '/case-studies', label: 'Casos de estudio' },
  { href: '/about', label: 'Sobre esta persona' },
  { href: '/contact', label: 'Contacto y disponibilidad' },
  { href: '/talks', label: 'Charlas y artículos' },
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

function Languages() {
  return (
    <Button size="sm" variant="soft" tone="neutral">
      English
    </Button>
  );
}

function Site(props: Partial<HeaderNavProps>) {
  const [pathname, setPathname] = useState(props.pathname ?? '/case-studies');
  function visit(href: string) {
    go(href);
    setPathname(href);
  }
  return (
    <AppShell
      skipLinkLabel="Skip to content"
      topBar={
        <TopBar
          start={
            <LinkButton href="#home" variant="ghost" tone="neutral">
              Ada Lovelace
            </LinkButton>
          }
          nav={
            <HeaderNav
              label="Main"
              links={props.links ?? links}
              pathname={pathname}
              title="Ada Lovelace"
              menuLabel="Menu"
              closeLabel="Close"
              footer={<Languages />}
              renderLink={(link) => <DemoLink href={link.href} onGo={visit} />}
            />
          }
          end={<Languages />}
        />
      }
    >
      <div style={{ padding: 'var(--ds-space-6) var(--ds-space-4)' }}>
        <h1 style={{ margin: 0 }}>Case studies</h1>
        <p>Shown: {pathname}</p>
      </div>
    </AppShell>
  );
}

const meta = {
  title: 'Components/HeaderNav',
  component: HeaderNav,
  args: {
    label: 'Main',
    links,
    pathname: '/case-studies',
    title: 'Ada Lovelace',
    menuLabel: 'Menu',
    closeLabel: 'Close',
  },
  render: (args) => <Site {...args} />,
  parameters: {
    layout: 'fullscreen',
    docs: { story: { inline: false, iframeHeight: 560 } },
  },
  beforeEach: () => {
    go.mockClear();
  },
} satisfies Meta<typeof HeaderNav>;

export default meta;

type Story = StoryObj<typeof meta>;

async function opened() {
  const sheet = await screen.findByRole('dialog', { name: 'Ada Lovelace' });
  await waitFor(() => expect(sheet).not.toHaveAttribute('data-starting-style'));
  await waitFor(() => expect(document.getAnimations()).toHaveLength(0));
  return sheet;
}

async function closed() {
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

function headerNav(canvasElement: HTMLElement) {
  const nav = canvasElement.querySelector<HTMLElement>('.ds-header-nav');
  if (!nav) throw new Error('The header navigation is missing');
  return nav;
}

export const Computer: Story = {
  globals: { viewport: { value: 'computer', isRotated: false } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const nav = canvas.getByRole('navigation', { name: 'Main' });
    const studies = within(nav).getByRole('link', { name: 'Case studies' });
    await expect(studies).toHaveAttribute('aria-current', 'page');
    await expect(within(nav).getByRole('link', { name: 'Work' })).not.toHaveAttribute(
      'aria-current'
    );
    await expect(canvas.queryByRole('button', { name: 'Menu' })).toBeNull();
    await waitFor(() => expect(headerNav(canvasElement)).not.toHaveAttribute('data-folded'));
    const banner = canvas.getByRole('banner');
    await expect(nav.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      banner.getBoundingClientRect().top
    );
    await userEvent.click(within(nav).getByRole('link', { name: 'About' }));
    await expect(go).toHaveBeenCalledWith('/about');
    await expect(within(nav).getByRole('link', { name: 'About' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  },
};

export const FoldsWhenTheLinksDoNotFit: Story = {
  globals: { viewport: { value: 'tablet', isRotated: false } },
  args: { links: spanish, pathname: '/about' },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await waitFor(() => expect(headerNav(canvasElement)).toHaveAttribute('data-folded'));
    await expect(canvas.queryByRole('navigation', { name: 'Main' })).toBeNull();
    const menu = canvas.getByRole('button', { name: 'Menu' });
    await expect(menu).toBeVisible();
    await userEvent.click(menu);
    const sheet = await opened();
    await expect(within(sheet).getByRole('link', { name: 'Sobre esta persona' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

export const RoomEnoughOnATablet: Story = {
  globals: { viewport: { value: 'tablet', isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    await waitFor(() => expect(headerNav(canvasElement)).not.toHaveAttribute('data-folded'));
    await expect(canvas.getByRole('navigation', { name: 'Main' })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Menu' })).toBeNull();
  },
};

export const Phone: Story = {
  globals: { viewport: { value: 'phone', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.queryByRole('navigation', { name: 'Main' })).toBeNull();
    const menu = canvas.getByRole('button', { name: 'Menu' });
    await expect(menu.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
    await userEvent.click(menu);
    const sheet = await opened();
    const box = sheet.getBoundingClientRect();
    await expect(box.top).toBeCloseTo(0, 0);
    await expect(box.width).toBeCloseTo(window.innerWidth, 0);
    await expect(box.height).toBeCloseTo(window.innerHeight, 0);
    const nav = within(sheet).getByRole('navigation', { name: 'Main' });
    const studies = within(nav).getByRole('link', { name: 'Case studies' });
    await expect(studies).toHaveAttribute('aria-current', 'page');
    await expect(studies.getBoundingClientRect().height).toBeGreaterThanOrEqual(48);
    await expect(within(sheet).getByRole('button', { name: 'English' })).toBeVisible();
    await waitFor(() => expect(sheet.contains(document.activeElement)).toBe(true));

    await userEvent.keyboard('{Escape}');
    await closed();
    await expect(menu).toHaveFocus();
  },
};

export const GoSomewhere: Story = {
  globals: { viewport: { value: 'phone', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Menu' }));
    const sheet = await opened();
    await userEvent.click(within(sheet).getByRole('link', { name: 'Contact' }));
    await expect(go).toHaveBeenCalledWith('/contact');
    await closed();
    await expect(canvas.getByText('Shown: /contact')).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: 'Menu' }));
    const again = await opened();
    await userEvent.click(within(again).getByRole('button', { name: 'Close' }));
    await closed();
  },
};

export const StaysShutWhenTheLinksShow: Story = {
  globals: { viewport: { value: 'computer', isRotated: false } },
  play: async ({ canvasElement }) => {
    const menu = canvasElement.querySelector<HTMLElement>('.ds-header-nav__menu');
    if (!menu) throw new Error('The menu button is missing');
    await waitFor(() => expect(menu).not.toBeVisible());
    menu.click();
    await expect(screen.queryByRole('dialog')).toBeNull();
  },
};

export const PlainLinks: Story = {
  globals: { viewport: { value: 'computer', isRotated: false } },
  render: (args) => (
    <TopBar
      start={<strong>Ada Lovelace</strong>}
      nav={<HeaderNav {...args} className="story-nav" />}
    />
  ),
  play: async ({ canvas, canvasElement }) => {
    await expect(headerNav(canvasElement)).toHaveClass('story-nav');
    const work = canvas.getByRole('link', { name: 'Work' });
    await expect(work).toHaveAttribute('href', '/');
    await expect(work).not.toHaveAttribute('data-router');
  },
};

export const ServerMarkup: Story = {
  play: async ({ args }) => {
    const html = renderToString(<HeaderNav {...args} />);
    await expect(html).toContain('<nav aria-label="Main" class="ds-header-nav__links">');
    await expect(html).toContain('aria-current="page"');
    await expect(html).not.toContain('data-folded');
    await expect(html).not.toContain('role="dialog"');
  },
};
