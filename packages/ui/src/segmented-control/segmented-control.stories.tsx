import type { Meta, StoryObj } from '@storybook/react-vite';
import { type ComponentPropsWithRef, type FormEvent, useState } from 'react';
import { renderToString } from 'react-dom/server';
import { expect, fn, waitFor } from 'storybook/test';
import { Segment, SegmentedControl } from './segmented-control.tsx';

const chosen = fn();

const views = [
  { value: 'list', label: 'List' },
  { value: 'grid', label: 'Grid' },
  { value: 'board', label: 'Board' },
];

const filters = [
  { href: '#/notes', label: 'All' },
  { href: '#/notes?status=open', label: 'Open' },
  { href: '#/notes?status=done', label: 'Done' },
];

function RouterLink(props: ComponentPropsWithRef<'a'>) {
  return <a {...props} data-router="demo" />;
}

function tokenColour(token: string): string {
  const probe = document.createElement('span');
  probe.style.setProperty('color', `var(${token})`);
  document.body.append(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}

function ChooseView() {
  const [view, setView] = useState('list');
  return (
    <SegmentedControl label="View">
      {views.map((option) => (
        <Segment
          key={option.value}
          current={view === option.value}
          onClick={() => setView(option.value)}
        >
          {option.label}
        </Segment>
      ))}
    </SegmentedControl>
  );
}

function submitted(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const submitter = (event.nativeEvent as SubmitEvent).submitter;
  chosen(submitter instanceof HTMLButtonElement ? submitter.value : undefined);
}

const meta = {
  title: 'Components/SegmentedControl',
  component: SegmentedControl,
  args: {
    label: 'Language',
    children: [
      <Segment key="en" lang="en" current>
        English
      </Segment>,
      <Segment key="es" lang="es">
        Español
      </Segment>,
    ],
  },
} satisfies Meta<typeof SegmentedControl>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    const group = canvas.getByRole('group', { name: 'Language' });
    await expect(group.tagName).toBe('FIELDSET');
    await expect(group).toHaveClass('ds-segmented');
    const english = canvas.getByRole('button', { name: 'English' });
    const spanish = canvas.getByRole('button', { name: 'Español' });
    await expect(english).toHaveAttribute('aria-pressed', 'true');
    await expect(spanish).toHaveAttribute('aria-pressed', 'false');
    await expect(english).toHaveAttribute('type', 'button');
    await expect(spanish).toHaveAttribute('lang', 'es');
    await expect(group.getBoundingClientRect().height).toBeCloseTo(32, 0);
    await expect(getComputedStyle(group).backgroundColor).toBe(tokenColour('--ds-color-bg-sunken'));
    await expect(getComputedStyle(english).backgroundColor).toBe(
      tokenColour('--ds-color-bg-raised')
    );
    await expect(getComputedStyle(english).borderTopColor).toBe(
      tokenColour('--ds-color-border-subtle')
    );
    await expect(getComputedStyle(english).color).toBe(tokenColour('--ds-color-fg-default'));
    await expect(getComputedStyle(spanish).backgroundColor).toBe('rgba(0, 0, 0, 0)');
    await expect(getComputedStyle(spanish).color).toBe(tokenColour('--ds-color-fg-muted'));
  },
};

export const Choosing: Story = {
  render: () => <ChooseView />,
  play: async ({ canvas, userEvent }) => {
    const grid = canvas.getByRole('button', { name: 'Grid' });
    await expect(canvas.getByRole('button', { name: 'List' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await userEvent.click(grid);
    await waitFor(() => expect(grid).toHaveAttribute('aria-pressed', 'true'));
    await expect(canvas.getByRole('button', { name: 'List' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    await userEvent.tab();
    await expect(canvas.getByRole('button', { name: 'Board' })).toHaveFocus();
    await userEvent.keyboard(' ');
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Board' })).toHaveAttribute('aria-pressed', 'true')
    );
  },
};

export const Links: Story = {
  args: {
    label: 'Show',
    children: filters.map((filter, index) => (
      <Segment key={filter.href} current={index === 1} render={<a href={filter.href} />}>
        {filter.label}
      </Segment>
    )),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('group', { name: 'Show' })).toBeVisible();
    await expect(canvas.queryByRole('button')).toBeNull();
    const open = canvas.getByRole('link', { name: 'Open' });
    const all = canvas.getByRole('link', { name: 'All' });
    await expect(open).toHaveAttribute('aria-current', 'page');
    await expect(open).toHaveAttribute('href', '#/notes?status=open');
    await expect(open).not.toHaveAttribute('aria-pressed');
    await expect(all).not.toHaveAttribute('aria-current');
    await expect(open).toHaveClass('ds-segment');
    await expect(getComputedStyle(open).backgroundColor).toBe(tokenColour('--ds-color-bg-raised'));
    await expect(getComputedStyle(open).textDecorationLine).toBe('none');
    await expect(getComputedStyle(all).backgroundColor).toBe('rgba(0, 0, 0, 0)');
  },
};

export const RouterLinks: Story = {
  args: {
    label: 'Show',
    className: 'story-filter',
    children: filters.map((filter, index) => (
      <Segment
        key={filter.href}
        current={index === 0}
        className="extra"
        render={<RouterLink href={filter.href} className="story-link" />}
      >
        {filter.label}
      </Segment>
    )),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('group', { name: 'Show' })).toHaveClass('story-filter');
    const all = canvas.getByRole('link', { name: 'All' });
    await expect(all).toHaveAttribute('data-router', 'demo');
    await expect(all).toHaveClass('story-link');
    await expect(all).toHaveClass('ds-segment');
    await expect(all).toHaveClass('extra');
    await expect(all).toHaveAttribute('aria-current', 'page');
  },
};

export const InAForm: Story = {
  render: (args) => (
    <form onSubmit={submitted}>
      <SegmentedControl label={args.label}>
        <Segment type="submit" name="locale" value="en" lang="en" current>
          English
        </Segment>
        <Segment type="submit" name="locale" value="es" lang="es">
          Español
        </Segment>
      </SegmentedControl>
    </form>
  ),
  play: async ({ canvas, userEvent }) => {
    chosen.mockClear();
    const spanish = canvas.getByRole('button', { name: 'Español' });
    await expect(spanish).toHaveAttribute('type', 'submit');
    await expect(spanish).toHaveAttribute('name', 'locale');
    await userEvent.click(spanish);
    await expect(chosen).toHaveBeenCalledWith('es');
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('group', { name: 'Language' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'English' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'Español' })).toBeDisabled();
  },
};

export const ManyOptionsOnAPhone: Story = {
  globals: { viewport: { value: 'phone', isRotated: false } },
  parameters: { layout: 'padded' },
  args: {
    label: 'Range',
    children: ['One day', 'One week', 'One month', 'Three months', 'One year', 'Everything'].map(
      (range, index) => (
        <Segment key={range} current={index === 2}>
          {range}
        </Segment>
      )
    ),
  },
  play: async ({ canvas, canvasElement }) => {
    const group = canvas.getByRole('group', { name: 'Range' });
    await expect(group.scrollWidth).toBeGreaterThan(group.clientWidth);
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

export const ServerMarkup: Story = {
  play: async () => {
    const buttons = renderToString(
      <SegmentedControl label="Language">
        <Segment current>English</Segment>
        <Segment>Español</Segment>
      </SegmentedControl>
    );
    await expect(buttons).toBe(
      '<fieldset aria-label="Language" class="ds-segmented"><button type="button" aria-pressed="true" class="ds-segment">English</button><button type="button" aria-pressed="false" class="ds-segment">Español</button></fieldset>'
    );
    const links = renderToString(
      <SegmentedControl label="Show">
        <Segment current render={<a href="/notes" />}>
          All
        </Segment>
        <Segment render={<a href="/notes?status=open" />}>Open</Segment>
      </SegmentedControl>
    );
    await expect(links).toBe(
      '<fieldset aria-label="Show" class="ds-segmented"><a href="/notes" class="ds-segment" aria-current="page">All</a><a href="/notes?status=open" class="ds-segment">Open</a></fieldset>'
    );
  },
};
