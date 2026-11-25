import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { LinkButton } from './button.tsx';

function ArrowUpRightIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  );
}

const meta = {
  title: 'Components/LinkButton',
  component: LinkButton,
  args: { children: 'Read the guide', href: '#guide' },
} satisfies Meta<typeof LinkButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    const link = canvas.getByRole('link', { name: 'Read the guide' });
    await expect(link).toHaveAttribute('href', '#guide');
    await expect(link).toHaveClass('ds-button');
    await expect(link).toHaveAttribute('data-variant', 'solid');
  },
};

export const Outline: Story = {
  args: {
    variant: 'outline',
    tone: 'neutral',
    size: 'sm',
    className: 'extra',
    children: 'Open the notes',
    startIcon: <ArrowUpRightIcon />,
    endIcon: <ArrowUpRightIcon />,
  },
  play: async ({ canvas }) => {
    const link = canvas.getByRole('link', { name: 'Open the notes' });
    await expect(link).toHaveClass('ds-button');
    await expect(link).toHaveClass('extra');
    await expect(link).toHaveAttribute('data-size', 'sm');
    await expect(link.querySelectorAll('.ds-button__icon')).toHaveLength(2);
  },
};

export const IconOnly: Story = {
  args: { iconOnly: true, 'aria-label': 'Open the notes', children: <ArrowUpRightIcon /> },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Open the notes' })).toHaveAttribute(
      'data-icon-only'
    );
  },
};

export const WithRender: Story = {
  args: { render: (props) => <a {...props} data-router-link="" /> },
  play: async ({ canvas }) => {
    const link = canvas.getByRole('link', { name: 'Read the guide' });
    await expect(link).toHaveAttribute('data-router-link');
    await expect(link).toHaveAttribute('href', '#guide');
  },
};
