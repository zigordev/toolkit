import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties } from 'react';
import { renderToString } from 'react-dom/server';
import { expect } from 'storybook/test';
import { Pill, type PillTone } from './pill.tsx';

const tones: PillTone[] = ['accent', 'neutral', 'info', 'success', 'warning', 'danger'];

const colours: Record<PillTone, [soft: string, text: string]> = {
  accent: ['--ds-color-accent-soft', '--ds-color-accent-text'],
  neutral: ['--ds-color-neutral-soft', '--ds-color-fg-default'],
  info: ['--ds-color-info-soft', '--ds-color-info-text'],
  success: ['--ds-color-success-soft', '--ds-color-success-text'],
  warning: ['--ds-color-warning-soft', '--ds-color-warning-text'],
  danger: ['--ds-color-danger-soft', '--ds-color-danger-text'],
};

const row: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 'var(--ds-space-2)',
};

function tokenColour(token: string): string {
  const probe = document.createElement('span');
  probe.style.setProperty('color', `var(${token})`);
  document.body.append(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}

const meta = {
  title: 'Components/Pill',
  component: Pill,
  args: { children: 'Open' },
  argTypes: { tone: { control: 'inline-radio', options: tones } },
} satisfies Meta<typeof Pill>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    const pill = canvas.getByText('Open');
    await expect(pill.tagName).toBe('SPAN');
    await expect(pill).toHaveClass('ds-pill');
    await expect(pill).toHaveAttribute('data-tone', 'accent');
    const style = getComputedStyle(pill);
    await expect(style.borderTopLeftRadius).toBe('9999px');
    await expect(style.fontSize).toBe('12px');
    await expect(style.fontWeight).toBe('600');
    await expect(style.backgroundColor).toBe(tokenColour('--ds-color-accent-soft'));
    await expect(style.color).toBe(tokenColour('--ds-color-accent-text'));
  },
};

export const Tones: Story = {
  render: (args) => (
    <div style={row}>
      {tones.map((tone) => (
        <Pill key={tone} {...args} tone={tone}>
          {`A ${tone} state`}
        </Pill>
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    for (const tone of tones) {
      const pill = canvas.getByText(`A ${tone} state`);
      const [soft, text] = colours[tone];
      await expect(pill).toHaveAttribute('data-tone', tone);
      await expect(getComputedStyle(pill).backgroundColor).toBe(tokenColour(soft));
      await expect(getComputedStyle(pill).color).toBe(tokenColour(text));
    }
  },
};

export const LongText: Story = {
  args: {
    tone: 'warning',
    className: 'extra',
    children: 'Waiting for the other player to confirm the result of the match',
  },
  render: (args) => (
    <div style={{ inlineSize: 'var(--ds-size-column-sm)' }}>
      <Pill {...args} />
    </div>
  ),
  play: async ({ canvas }) => {
    const pill = canvas.getByText(/^Waiting for the other player/);
    await expect(pill).toHaveClass('ds-pill');
    await expect(pill).toHaveClass('extra');
    await expect(pill.getBoundingClientRect().width).toBeLessThanOrEqual(192.5);
    await expect(pill.scrollWidth).toBeGreaterThan(pill.clientWidth);
    await expect(getComputedStyle(pill).textOverflow).toBe('ellipsis');
  },
};

export const ServerMarkup: Story = {
  play: async () => {
    await expect(renderToString(<Pill tone="success">Done</Pill>)).toBe(
      '<span class="ds-pill" data-tone="success">Done</span>'
    );
    await expect(renderToString(<Pill>Open</Pill>)).toBe(
      '<span class="ds-pill" data-tone="accent">Open</span>'
    );
  },
};
