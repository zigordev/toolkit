import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties } from 'react';
import { expect } from 'storybook/test';
import { Alert, type AlertTone } from './alert.tsx';

const tones: AlertTone[] = ['info', 'success', 'warning', 'danger'];

const stack: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--ds-space-3)',
  inlineSize: 'var(--ds-size-column-sm)',
};

const meta = {
  title: 'Components/Alert',
  component: Alert,
  args: { children: 'Check your inbox: a link there confirms the address.' },
  argTypes: { tone: { control: 'inline-radio', options: tones } },
} satisfies Meta<typeof Alert>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    const alert = canvas.getByRole('status');
    await expect(alert).toHaveClass('ds-alert');
    await expect(alert).toHaveAttribute('data-tone', 'info');
    await expect(alert).toHaveTextContent('Check your inbox: a link there confirms the address.');
    await expect(alert.querySelector('.ds-alert__title')).toBeNull();
  },
};

export const Tones: Story = {
  render: (args) => (
    <div style={stack}>
      {tones.map((tone) => (
        <Alert key={tone} {...args} tone={tone} title={`A ${tone} title`}>
          {`A ${tone} message.`}
        </Alert>
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('status')).toHaveLength(2);
    await expect(canvas.getAllByRole('alert')).toHaveLength(2);
    await expect(canvas.getByText('A danger title')).toHaveClass('ds-alert__title');
  },
};

export const Danger: Story = {
  args: {
    tone: 'danger',
    className: 'extra',
    children: <p>The email or the password is wrong.</p>,
  },
  play: async ({ canvas }) => {
    const alert = canvas.getByRole('alert');
    await expect(alert).toHaveClass('ds-alert');
    await expect(alert).toHaveClass('extra');
    await expect(alert).toHaveTextContent('The email or the password is wrong.');
  },
};
