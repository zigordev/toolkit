import type { Meta, StoryObj } from '@storybook/react-vite';
import { type ComponentPropsWithRef, useState } from 'react';
import { renderToString } from 'react-dom/server';
import { expect, fn, screen, waitFor, within } from 'storybook/test';
import { TopBar } from '../app-shell/app-shell.tsx';
import { LinkButton } from '../button/button.tsx';
import type { Place } from '../places/places.ts';
import { AccountMenu, type AccountMenuProps, initialsOf } from './account-menu.tsx';

const speak = fn();
const paint = fn();
const leave = fn();
const go = fn();

function RouterLink({ href = '', onClick, ...props }: ComponentPropsWithRef<'a'>) {
  return (
    <a
      {...props}
      href={href}
      data-router="demo"
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
        go(href);
      }}
    />
  );
}

function routerLink(place: Place) {
  return <RouterLink href={place.href} />;
}

function Bar(props: AccountMenuProps) {
  const [language, setLanguage] = useState('en');
  const [mode, setMode] = useState('system');
  return (
    <TopBar
      start={
        <LinkButton href="#home" variant="ghost" tone="neutral">
          Notebook
        </LinkButton>
      }
      end={
        <AccountMenu
          {...props}
          choices={props.choices?.map((choice) =>
            choice.label === 'Language'
              ? {
                  ...choice,
                  value: language,
                  onValueChange: (value) => {
                    choice.onValueChange(value);
                    setLanguage(value);
                  },
                }
              : {
                  ...choice,
                  value: mode,
                  onValueChange: (value) => {
                    choice.onValueChange(value);
                    setMode(value);
                  },
                }
          )}
        />
      }
    />
  );
}

const meta = {
  title: 'Components/AccountMenu',
  component: AccountMenu,
  args: {
    label: 'Your account, Ada Lovelace',
    name: 'Ada Lovelace',
    detail: 'ada@example.com',
    choices: [
      {
        label: 'Language',
        value: 'en',
        options: [
          { value: 'en', label: 'English', lang: 'en' },
          { value: 'es', label: 'Español', lang: 'es' },
        ],
        onValueChange: speak,
      },
      {
        label: 'Appearance',
        value: 'system',
        options: [
          { value: 'system', label: 'System' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ],
        onValueChange: paint,
      },
    ],
    links: [{ href: '/account', label: 'Account settings', icon: 'settings' }],
    signOutLabel: 'Sign out',
    onSignOut: leave,
  },
  render: (args) => <Bar {...args} />,
  parameters: {
    layout: 'fullscreen',
    docs: { story: { inline: false, iframeHeight: 520 } },
  },
  beforeEach: () => {
    speak.mockClear();
    paint.mockClear();
    leave.mockClear();
    go.mockClear();
  },
} satisfies Meta<typeof AccountMenu>;

export default meta;

type Story = StoryObj<typeof meta>;

async function opened() {
  const menu = await screen.findByRole('menu', { name: 'Your account, Ada Lovelace' });
  await waitFor(() => expect(menu).not.toHaveAttribute('data-starting-style'));
  await waitFor(() => expect(document.getAnimations()).toHaveLength(0));
  return menu;
}

async function closed() {
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
}

export const Closed: Story = {
  play: async ({ canvas, canvasElement }) => {
    const trigger = canvas.getByRole('button', { name: 'Your account, Ada Lovelace' });
    await expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger.textContent).toBe('');
    const avatar = canvasElement.querySelector('.ds-account-menu__avatar');
    await expect(avatar).toHaveAttribute('data-initials', 'AL');
    await expect(avatar).toHaveAttribute('aria-hidden', 'true');
    await expect(screen.queryByRole('menu')).toBeNull();
    await expect(initialsOf('Ada Lovelace')).toBe('AL');
    await expect(initialsOf('Ada')).toBe('A');
    await expect(initialsOf('  maría   josé  garcía ')).toBe('MG');
    await expect(initialsOf('émile zola')).toBe('ÉZ');
    await expect(initialsOf('𝔄da Lovelace')).toBe('𝔄L');
    await expect(initialsOf('   ')).toBe('');
  },
};

export const OpenWithAClick: Story = {
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Your account, Ada Lovelace' });
    await userEvent.click(trigger);
    const menu = await opened();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(menu.closest('.ds-account-menu__holder')?.parentElement).toBe(
      trigger.parentElement
    );
    await expect(within(menu).getByText('Ada Lovelace')).toBeVisible();
    await expect(within(menu).getByText('ada@example.com')).toBeVisible();
    const language = within(menu).getByRole('group', { name: 'Language' });
    await expect(within(language).getByRole('menuitemradio', { name: 'English' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    const spanish = within(language).getByRole('menuitemradio', { name: 'Español' });
    await expect(spanish).toHaveAttribute('aria-checked', 'false');
    await expect(within(spanish).getByText('Español')).toHaveAttribute('lang', 'es');
    const appearance = within(menu).getByRole('group', { name: 'Appearance' });
    await expect(within(appearance).getAllByRole('menuitemradio')).toHaveLength(3);
    await expect(within(appearance).getByRole('menuitemradio', { name: 'System' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    const settings = within(menu).getByRole('menuitem', { name: 'Account settings' });
    await expect(settings).toHaveAttribute('href', '/account');
    await expect(within(menu).getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
    await expect(menu.getBoundingClientRect().width).toBeGreaterThanOrEqual(256);
    await expect(menu.getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth - 7);
  },
};

export const ChooseAnOption: Story = {
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Your account, Ada Lovelace' });
    await userEvent.click(trigger);
    const menu = await opened();
    await userEvent.click(within(menu).getByRole('menuitemradio', { name: 'Dark' }));
    await expect(paint).toHaveBeenCalledWith('dark');
    await closed();
    await expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    const again = await opened();
    await expect(within(again).getByRole('menuitemradio', { name: 'Dark' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await userEvent.click(within(again).getByRole('menuitemradio', { name: 'Español' }));
    await expect(speak).toHaveBeenCalledWith('es');
    await expect(paint).toHaveBeenCalledTimes(1);
    await closed();
  },
};

export const WithTheKeyboard: Story = {
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Your account, Ada Lovelace' });
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    const menu = await opened();
    await waitFor(() =>
      expect(within(menu).getByRole('menuitemradio', { name: 'English' })).toHaveFocus()
    );
    await userEvent.keyboard('{ArrowDown}');
    await expect(within(menu).getByRole('menuitemradio', { name: 'Español' })).toHaveFocus();
    await userEvent.keyboard('{End}');
    await expect(within(menu).getByRole('menuitem', { name: 'Sign out' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await closed();
    await expect(trigger).toHaveFocus();
    await expect(leave).not.toHaveBeenCalled();
  },
};

export const SignOut: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Your account, Ada Lovelace' }));
    const menu = await opened();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Sign out' }));
    await expect(leave).toHaveBeenCalledTimes(1);
    await closed();
  },
};

export const RouterLinks: Story = {
  args: { renderLink: routerLink, className: 'story-account' },
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Your account, Ada Lovelace' });
    await expect(trigger).toHaveClass('story-account');
    await userEvent.click(trigger);
    const menu = await opened();
    const settings = within(menu).getByRole('menuitem', { name: 'Account settings' });
    await expect(settings).toHaveAttribute('data-router', 'demo');
    await userEvent.click(settings);
    await expect(go).toHaveBeenCalledWith('/account');
    await closed();
  },
};

export const Phone: Story = {
  globals: { viewport: { value: 'phone', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Your account, Ada Lovelace' });
    await expect(trigger.getBoundingClientRect().width).toBeGreaterThanOrEqual(40);
    await userEvent.click(trigger);
    const menu = await opened();
    const box = menu.getBoundingClientRect();
    await expect(box.left).toBeGreaterThanOrEqual(7);
    await expect(box.right).toBeLessThanOrEqual(window.innerWidth - 7);
    await expect(box.top).toBeGreaterThan(trigger.getBoundingClientRect().bottom);
  },
};

export const NameAndSignOutOnly: Story = {
  args: {
    label: 'Your account, Ada Lovelace',
    name: 'Ada Lovelace',
    signOutLabel: 'Sign out',
    onSignOut: leave,
    detail: undefined,
    choices: undefined,
    links: undefined,
  },
  render: (args) => <AccountMenu {...args} />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Your account, Ada Lovelace' }));
    const menu = await opened();
    await expect(within(menu).queryByRole('group')).toBeNull();
    await expect(within(menu).getAllByRole('menuitem')).toHaveLength(1);
    await expect(within(menu).getAllByRole('separator')).toHaveLength(1);
    await expect(menu.querySelector('.ds-account-menu__detail')).toBeNull();
  },
};

export const ServerMarkup: Story = {
  play: async ({ args }) => {
    const html = renderToString(<AccountMenu {...args} />);
    await expect(html).toContain('aria-label="Your account, Ada Lovelace"');
    await expect(html).toContain('data-initials="AL"');
    await expect(html).not.toContain('role="menu"');
    await expect(html).not.toContain('ada@example.com');
  },
};
