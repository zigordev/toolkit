import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import { Checkbox } from './checkbox.tsx';

const meta = {
  title: 'Components/Checkbox',
  component: Checkbox,
  args: { label: 'Trust this device', name: 'trust' },
} satisfies Meta<typeof Checkbox>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { onChange: fn() },
  play: async ({ args, canvas, userEvent }) => {
    const box = canvas.getByRole('checkbox', { name: 'Trust this device' });
    await expect(box).not.toBeChecked();
    await expect(box).toHaveAttribute('name', 'trust');
    await expect(box).not.toHaveAttribute('aria-describedby');
    await userEvent.click(canvas.getByText('Trust this device'));
    await expect(box).toBeChecked();
    await expect(args.onChange).toHaveBeenCalledOnce();
  },
};

export const WithDescription: Story = {
  args: {
    description: 'You will not be asked for a code on this device for 30 days.',
    'aria-describedby': 'outside-hint',
  },
  render: (args) => (
    <div>
      <Checkbox {...args} />
      <p id="outside-hint">Only on a device you own.</p>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('checkbox', { name: 'Trust this device' })
    ).toHaveAccessibleDescription(
      'Only on a device you own. You will not be asked for a code on this device for 30 days.'
    );
  },
};

export const Checked: Story = {
  args: { id: 'done', label: 'Done', name: 'done', defaultChecked: true },
  play: async ({ canvas, userEvent }) => {
    const box = canvas.getByRole('checkbox', { name: 'Done' });
    await expect(box).toHaveAttribute('id', 'done');
    await expect(box).toBeChecked();
    await userEvent.keyboard('{Tab}');
    await expect(box).toHaveFocus();
    await userEvent.keyboard(' ');
    await expect(box).not.toBeChecked();
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas, userEvent }) => {
    const box = canvas.getByRole('checkbox', { name: 'Trust this device' });
    await expect(box).toBeDisabled();
    await userEvent.click(canvas.getByText('Trust this device'));
    await expect(box).not.toBeChecked();
  },
};
