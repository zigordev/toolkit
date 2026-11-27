import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { Icon, iconNames } from './icon.tsx';

const meta = {
  title: 'Components/Icon',
  component: Icon,
  args: { name: 'house' },
} satisfies Meta<typeof Icon>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const icon = canvasElement.querySelector('svg');
    await expect(icon).toHaveClass('ds-icon');
    await expect(icon).toHaveAttribute('aria-hidden', 'true');
  },
};

export const EveryIcon: Story = {
  render: () => (
    <ul className="story-icons">
      {iconNames.map((name) => (
        <li key={name}>
          <Icon name={name} className="story-icon" />
          <code>{name}</code>
        </li>
      ))}
    </ul>
  ),
  play: async ({ canvasElement }) => {
    const icons = canvasElement.querySelectorAll('svg.ds-icon.story-icon');
    await expect(icons).toHaveLength(iconNames.length);
    for (const icon of icons) {
      await expect(icon).toHaveAttribute('aria-hidden', 'true');
    }
  },
};
