import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties } from 'react';
import { expect, fn } from 'storybook/test';
import { TextArea } from './text-field.tsx';

const stack: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--ds-space-4)',
  inlineSize: 'var(--ds-size-column-sm)',
};

const meta = {
  title: 'Components/TextArea',
  component: TextArea,
  args: { label: 'Body', name: 'body', rows: 6 },
  decorators: [
    (Story) => (
      <div style={stack}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TextArea>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { defaultValue: 'First line', onChange: fn() },
  play: async ({ args, canvas, userEvent }) => {
    const area = canvas.getByRole('textbox', { name: 'Body' });
    await expect(area.tagName).toBe('TEXTAREA');
    await expect(area).toHaveAttribute('rows', '6');
    await expect(area).toHaveAttribute('name', 'body');
    await expect(area).toHaveClass('ds-field__control');
    await userEvent.type(area, '{Enter}Second line');
    await expect(area).toHaveValue('First line\nSecond line');
    await expect(args.onChange).toHaveBeenCalled();
  },
};

export const Invalid: Story = {
  args: { description: 'Plain text, as long as you like.', error: 'The body is too long.' },
  play: async ({ canvas }) => {
    const area = canvas.getByRole('textbox', { name: 'Body' });
    await expect(area).toHaveAttribute('aria-invalid', 'true');
    await expect(area).toHaveAccessibleDescription(
      expect.stringContaining('The body is too long.')
    );
    await expect(area).toHaveAccessibleDescription(
      expect.stringContaining('Plain text, as long as you like.')
    );
  },
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: 'Kept as it is' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('textbox', { name: 'Body' })).toBeDisabled();
  },
};
