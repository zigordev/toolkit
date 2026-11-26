import type { Meta, StoryObj } from '@storybook/react-vite';
import { type CSSProperties, useRef } from 'react';
import { expect, fn } from 'storybook/test';
import { Button } from '../button/button.tsx';
import { TextArea, TextField } from './text-field.tsx';

const stack: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--ds-space-4)',
  inlineSize: 'var(--ds-size-column-sm)',
};

const meta = {
  title: 'Components/TextField',
  component: TextField,
  args: { label: 'Title', name: 'title' },
  decorators: [
    (Story) => (
      <div style={stack}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TextField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { onChange: fn() },
  play: async ({ args, canvas, userEvent }) => {
    const input = canvas.getByRole('textbox', { name: 'Title' });
    await expect(input).toHaveAttribute('name', 'title');
    await expect(input).not.toHaveAttribute('aria-invalid');
    await userEvent.type(input, 'Buy milk');
    await expect(input).toHaveValue('Buy milk');
    await expect(args.onChange).toHaveBeenCalled();
  },
};

export const WithDescription: Story = {
  args: { description: 'It shows in the list of notes.' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('textbox', { name: 'Title' })).toHaveAccessibleDescription(
      'It shows in the list of notes.'
    );
  },
};

export const Invalid: Story = {
  args: { description: 'It shows in the list of notes.', error: 'Give the note a title.' },
  play: async ({ canvas }) => {
    const input = canvas.getByRole('textbox', { name: 'Title' });
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toHaveAccessibleDescription(
      expect.stringContaining('Give the note a title.')
    );
    await expect(canvas.getByText('Give the note a title.')).toHaveClass('ds-field__error');
  },
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: 'Kept as it is' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('textbox', { name: 'Title' })).toBeDisabled();
  },
};

export const Types: Story = {
  render: () => (
    <>
      <TextField label="Email" name="email" type="email" autoComplete="email" />
      <TextField label="Password" name="password" type="password" autoComplete="current-password" />
      <TextField label="Search the notes" name="q" type="search" placeholder="Milk" />
    </>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('textbox', { name: 'Email' })).toHaveAttribute('type', 'email');
    await expect(canvas.getByLabelText('Password')).toHaveAttribute('type', 'password');
    await expect(canvas.getByRole('searchbox', { name: 'Search the notes' })).toHaveAttribute(
      'placeholder',
      'Milk'
    );
  },
};

function Focusable() {
  const input = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  return (
    <>
      <TextField label="Title" name="title" ref={input} />
      <TextArea label="Body" name="body" ref={area} />
      <Button variant="outline" tone="neutral" onClick={() => input.current?.focus()}>
        Focus the title
      </Button>
      <Button variant="outline" tone="neutral" onClick={() => area.current?.focus()}>
        Focus the body
      </Button>
    </>
  );
}

export const PassesItsRef: Story = {
  render: () => <Focusable />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Focus the title' }));
    await expect(canvas.getByRole('textbox', { name: 'Title' })).toHaveFocus();
    await userEvent.click(canvas.getByRole('button', { name: 'Focus the body' }));
    await expect(canvas.getByRole('textbox', { name: 'Body' })).toHaveFocus();
  },
};
