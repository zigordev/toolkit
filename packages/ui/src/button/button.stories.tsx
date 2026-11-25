import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties } from 'react';
import { expect, fn } from 'storybook/test';
import { Button, type ButtonTone, type ButtonVariant } from './button.tsx';

const variants: ButtonVariant[] = ['solid', 'soft', 'outline', 'ghost'];
const tones: ButtonTone[] = ['accent', 'neutral', 'danger'];

const row: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 'var(--ds-space-3)',
};
const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: `repeat(${variants.length}, auto)`,
  gap: 'var(--ds-space-3)',
};

function PlusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

const meta = {
  title: 'Components/Button',
  component: Button,
  args: { children: 'Save changes', onClick: fn() },
  argTypes: {
    variant: { control: 'inline-radio', options: variants },
    tone: { control: 'inline-radio', options: tones },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
  },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const button = canvas.getByRole('button', { name: 'Save changes' });
    await expect(button).toHaveAttribute('type', 'button');
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};

export const Variants: Story = {
  render: (args) => (
    <div style={grid}>
      {tones.flatMap((tone) =>
        variants.map((variant) => (
          <Button key={`${tone}-${variant}`} {...args} tone={tone} variant={variant}>
            {`${variant} ${tone}`}
          </Button>
        ))
      )}
    </div>
  ),
  play: async ({ canvas }) => {
    const buttons = canvas.getAllByRole('button');
    await expect(buttons).toHaveLength(variants.length * tones.length);
    await expect(buttons[0]).toHaveAttribute('data-variant', 'solid');
    await expect(buttons[0]).toHaveAttribute('data-tone', 'accent');
  },
};

export const Sizes: Story = {
  render: (args) => (
    <div style={row}>
      <Button {...args} size="sm">
        Small
      </Button>
      <Button {...args} size="md">
        Medium
      </Button>
      <Button {...args} size="lg">
        Large
      </Button>
    </div>
  ),
  play: async ({ canvas }) => {
    const [small, medium, large] = canvas.getAllByRole('button');
    await expect(small).toHaveAttribute('data-size', 'sm');
    await expect(medium).toHaveAttribute('data-size', 'md');
    await expect(large).toHaveAttribute('data-size', 'lg');
    const height = (element: HTMLElement | undefined) =>
      element === undefined ? 0 : element.getBoundingClientRect().height;
    await expect(height(small)).toBeLessThan(height(medium));
    await expect(height(medium)).toBeLessThan(height(large));
  },
};

export const WithIcons: Story = {
  args: { children: 'Add note', startIcon: <PlusIcon /> },
  render: (args) => (
    <div style={row}>
      <Button {...args} />
      <Button endIcon={<ArrowRightIcon />} variant="outline" tone="neutral">
        Next page
      </Button>
    </div>
  ),
  play: async ({ canvas }) => {
    const add = canvas.getByRole('button', { name: 'Add note' });
    await expect(add.querySelector('.ds-button__icon')).toHaveAttribute('aria-hidden', 'true');
  },
};

export const IconOnly: Story = {
  args: { iconOnly: true, 'aria-label': 'Add note', children: <PlusIcon /> },
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button', { name: 'Add note' });
    await expect(button).toHaveAttribute('data-icon-only');
  },
};

export const Keyboard: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.tab();
    await expect(canvas.getByRole('button')).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    await expect(args.onClick).toHaveBeenCalledTimes(2);
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ args, canvas, userEvent }) => {
    const button = canvas.getByRole('button');
    await expect(button).toBeDisabled();
    await userEvent.click(button);
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};

export const Loading: Story = {
  args: { loading: true, startIcon: <PlusIcon />, endIcon: <ArrowRightIcon /> },
  play: async ({ args, canvas, userEvent }) => {
    const button = canvas.getByRole('button', { name: 'Save changes' });
    await expect(button).toHaveAttribute('aria-busy', 'true');
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await expect(button.querySelector('.ds-button__spinner')).not.toBeNull();
    await expect(button.querySelector('.ds-button__icon')).toBeNull();
    await userEvent.tab();
    await expect(button).toHaveFocus();
    await userEvent.click(button);
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};

export const LoadingIconOnly: Story = {
  args: { iconOnly: true, 'aria-label': 'Add note', children: <PlusIcon />, loading: true },
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button', { name: 'Add note' });
    await expect(button).toHaveAttribute('aria-busy', 'true');
    await expect(button.querySelector('.ds-button__spinner')).not.toBeNull();
  },
};

export const Submit: Story = {
  args: { type: 'submit', children: 'Send' },
  render: (args) => (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        args.onClick?.(event as never);
      }}
    >
      <Button {...args} />
    </form>
  ),
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Send' }));
    await expect(args.onClick).toHaveBeenCalled();
  },
};
