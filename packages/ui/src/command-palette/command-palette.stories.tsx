import type { Meta, StoryObj } from '@storybook/react-vite';
import { renderToString } from 'react-dom/server';
import { expect, fn, screen, waitFor, within } from 'storybook/test';
import {
  type CommandGroup,
  CommandPalette,
  isPaletteShortcut,
  shortcutKeys,
} from './command-palette.tsx';

const go = fn();
const speak = fn();

const groups: CommandGroup[] = [
  {
    label: 'Go to',
    commands: [
      { id: 'home', label: 'Home', icon: 'house', onSelect: () => go('/') },
      { id: 'notes', label: 'Notes', icon: 'notebook-pen', onSelect: () => go('/notes') },
      { id: 'account', label: 'Account', icon: 'circle-user', onSelect: () => go('/account') },
    ],
  },
  { label: 'Recent', commands: [] },
  {
    label: 'Language',
    commands: [
      {
        id: 'language-es',
        label: 'Español',
        icon: 'languages',
        lang: 'es',
        keywords: ['Language', 'Spanish'],
        onSelect: () => speak('es'),
      },
    ],
  },
];

const meta = {
  title: 'Components/CommandPalette',
  component: CommandPalette,
  args: {
    label: 'Search',
    placeholder: 'Search places and actions',
    emptyLabel: 'Nothing matches',
    closeLabel: 'Close',
    groups,
  },
  parameters: { docs: { story: { inline: false, iframeHeight: 480 } } },
  beforeEach: () => {
    go.mockClear();
    speak.mockClear();
  },
} satisfies Meta<typeof CommandPalette>;

export default meta;

type Story = StoryObj<typeof meta>;

async function opened() {
  const dialog = await screen.findByRole('dialog', { name: 'Search' });
  const input = within(dialog).getByRole('combobox', { name: 'Search' });
  await waitFor(() => expect(input).toHaveFocus());
  await waitFor(() => expect(dialog).not.toHaveAttribute('data-starting-style'));
  await waitFor(() => expect(dialog).toBeVisible());
  return { dialog, input };
}

function optionsIn(dialog: HTMLElement) {
  return within(dialog)
    .queryAllByRole('option')
    .map((option) => option.textContent);
}

async function closed() {
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

const keystroke = {
  key: 'k',
  metaKey: false,
  ctrlKey: true,
  altKey: false,
  shiftKey: false,
  repeat: false,
};

export const Closed: Story = {
  play: async ({ canvas, canvasElement }) => {
    const trigger = canvas.getByRole('button', { name: 'Search' });
    await expect(trigger).toHaveAttribute('aria-keyshortcuts', 'Control+K Meta+K');
    await expect(canvasElement.querySelector('.ds-command-palette__keys')).toHaveAttribute(
      'data-keys',
      shortcutKeys(navigator.userAgent)
    );
    await expect(screen.queryByRole('dialog')).toBeNull();
    await expect(isPaletteShortcut(keystroke)).toBe(true);
    await expect(isPaletteShortcut({ ...keystroke, key: 'K' })).toBe(true);
    await expect(isPaletteShortcut({ ...keystroke, ctrlKey: false, metaKey: true })).toBe(true);
    await expect(isPaletteShortcut({ ...keystroke, ctrlKey: false })).toBe(false);
    await expect(isPaletteShortcut({ ...keystroke, shiftKey: true })).toBe(false);
    await expect(isPaletteShortcut({ ...keystroke, altKey: true })).toBe(false);
    await expect(isPaletteShortcut({ ...keystroke, repeat: true })).toBe(false);
    await expect(isPaletteShortcut({ ...keystroke, key: 'j' })).toBe(false);
    await expect(shortcutKeys('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('⌘K');
    await expect(shortcutKeys('Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X)')).toBe('⌘K');
    await expect(shortcutKeys('Mozilla/5.0 (X11; Linux x86_64)')).toBe('Ctrl K');
  },
};

export const OpenWithTheKeyboard: Story = {
  play: async ({ userEvent }) => {
    await userEvent.keyboard('{Control>}k{/Control}');
    const { dialog, input } = await opened();
    await expect(input).toHaveAttribute('placeholder', 'Search places and actions');
    await expect(within(dialog).getByRole('group', { name: 'Go to' })).toBeVisible();
    await expect(within(dialog).getByRole('group', { name: 'Language' })).toBeVisible();
    await expect(within(dialog).queryByRole('group', { name: 'Recent' })).toBeNull();
    await expect(optionsIn(dialog)).toEqual(['Home', 'Notes', 'Account', 'Español']);
    const home = within(dialog).getByRole('option', { name: 'Home' });
    await expect(home).toHaveAttribute('data-highlighted');
    await expect(input).toHaveAttribute('aria-activedescendant', home.id);
    await expect(within(dialog).getByText('Español')).toHaveAttribute('lang', 'es');
  },
};

export const RunACommand: Story = {
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Search' });
    await userEvent.click(trigger);
    const { dialog, input } = await opened();
    await userEvent.type(input, 'acc');
    await waitFor(() => expect(optionsIn(dialog)).toEqual(['Account']));
    await userEvent.keyboard('{Enter}');
    await expect(go).toHaveBeenCalledWith('/account');
    await closed();
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

export const MoveWithTheArrows: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Search' }));
    const { dialog } = await opened();
    await userEvent.keyboard('{ArrowDown}');
    await expect(within(dialog).getByRole('option', { name: 'Notes' })).toHaveAttribute(
      'data-highlighted'
    );
    await userEvent.keyboard('{Enter}');
    await expect(go).toHaveBeenCalledWith('/notes');
    await closed();
  },
};

export const FindByKeyword: Story = {
  play: async ({ userEvent }) => {
    await userEvent.keyboard('{Meta>}k{/Meta}');
    const { dialog, input } = await opened();
    await userEvent.type(input, 'spanish');
    await waitFor(() => expect(optionsIn(dialog)).toEqual(['Español']));
    await userEvent.clear(input);
    await userEvent.type(input, 'espanol');
    await waitFor(() => expect(optionsIn(dialog)).toEqual(['Español']));
    await userEvent.click(within(dialog).getByRole('option', { name: 'Español' }));
    await expect(speak).toHaveBeenCalledWith('es');
    await expect(go).not.toHaveBeenCalled();
    await closed();
  },
};

export const NothingMatches: Story = {
  play: async ({ userEvent }) => {
    await userEvent.keyboard('{Control>}k{/Control}');
    const { dialog, input } = await opened();
    await userEvent.type(input, 'zzz');
    await expect(await within(dialog).findByText('Nothing matches')).toBeVisible();
    await expect(optionsIn(dialog)).toEqual([]);
  },
};

export const CloseAgain: Story = {
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Search' });
    await userEvent.click(trigger);
    await opened();
    await userEvent.keyboard('{Escape}');
    await closed();
    await waitFor(() => expect(trigger).toHaveFocus());

    await userEvent.keyboard('{Meta>}k{/Meta}');
    await opened();
    await userEvent.keyboard('{Meta>}k{/Meta}');
    await closed();

    await userEvent.click(trigger);
    const { dialog } = await opened();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await closed();
    await expect(go).not.toHaveBeenCalled();
    await expect(speak).not.toHaveBeenCalled();
  },
};

export const WithoutIcons: Story = {
  args: {
    groups: [
      {
        label: 'Help',
        commands: [{ id: 'shortcuts', label: 'Keyboard shortcuts', onSelect: () => go('/help') }],
      },
    ],
  },
  play: async ({ userEvent }) => {
    await userEvent.keyboard('{Control>}k{/Control}');
    const { dialog } = await opened();
    const option = within(dialog).getByRole('option', { name: 'Keyboard shortcuts' });
    await expect(option.querySelector('svg')).toBeNull();
    await userEvent.keyboard('{Enter}');
    await expect(go).toHaveBeenCalledWith('/help');
  },
};

export const Phone: Story = {
  globals: { viewport: { value: 'phone', isRotated: false } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Search' });
    await expect(trigger.getBoundingClientRect().width).toBeCloseTo(32, 0);
    await expect(
      canvasElement.querySelector('.ds-command-palette__trigger-label')
    ).not.toBeVisible();
    await expect(canvasElement.querySelector('.ds-command-palette__keys')).not.toBeVisible();
    await userEvent.click(trigger);
    const { dialog } = await opened();
    await waitFor(() =>
      expect(dialog.getBoundingClientRect().width).toBeCloseTo(window.innerWidth - 16, 0)
    );
  },
};

export const Computer: Story = {
  globals: { viewport: { value: 'computer', isRotated: false } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Search' });
    await expect(trigger.getBoundingClientRect().width).toBeCloseTo(192, 0);
    await expect(canvasElement.querySelector('.ds-command-palette__trigger-label')).toBeVisible();
    await expect(canvasElement.querySelector('.ds-command-palette__keys')).toBeVisible();
    await userEvent.click(trigger);
    const { dialog } = await opened();
    await waitFor(() => expect(dialog.getBoundingClientRect().width).toBeCloseTo(512, 0));
    await waitFor(() => expect(dialog.getBoundingClientRect().top).toBeCloseTo(64, 0));
  },
};

export const ServerMarkup: Story = {
  play: async ({ args }) => {
    const html = renderToString(<CommandPalette {...args} />);
    await expect(html).toContain('aria-keyshortcuts="Control+K Meta+K"');
    await expect(html).toContain(
      '<span class="ds-command-palette__keys" aria-hidden="true"></span>'
    );
    await expect(html).not.toContain('role="dialog"');
  },
};
