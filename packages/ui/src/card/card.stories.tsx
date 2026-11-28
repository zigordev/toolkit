import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import type { ComponentPropsWithRef, CSSProperties } from 'react';
import { renderToString } from 'react-dom/server';
import { expect, fn } from 'storybook/test';
import { Button } from '../button/button.tsx';
import { Pill } from '../pill/pill.tsx';
import { Card } from './card.tsx';

const pick = fn();

const column: CSSProperties = {
  inlineSize: 'var(--ds-size-container-sm)',
  maxInlineSize: '100%',
};

const list: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--ds-space-2)',
  margin: 0,
  padding: 0,
  listStyle: 'none',
};

const inColumn: Decorator = (Story) => (
  <div style={column}>
    <Story />
  </div>
);

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

function middle(element: Element): number {
  const box = element.getBoundingClientRect();
  return (box.top + box.bottom) / 2;
}

function partOf(canvasElement: HTMLElement, part: string): HTMLElement {
  const element = canvasElement.querySelector<HTMLElement>(`.ds-card__${part}`);
  if (!element) throw new Error(`The card has no ${part}`);
  return element;
}

const meta = {
  title: 'Components/Card',
  component: Card,
  args: { label: 'Today, 21:00', title: 'Spain – Italy', end: <Pill>Your pick 2–1</Pill> },
  parameters: { layout: 'padded' },
  decorators: [inColumn],
} satisfies Meta<typeof Card>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, canvasElement }) => {
    const card = canvasElement.querySelector<HTMLElement>('.ds-card');
    if (!card) throw new Error('The card is missing');
    const label = partOf(canvasElement, 'label');
    const title = partOf(canvasElement, 'title');
    const pill = canvas.getByText('Your pick 2–1');
    await expect(label).toHaveTextContent('Today, 21:00');
    await expect(title).toHaveTextContent('Spain – Italy');
    await expect(partOf(canvasElement, 'end')).toContainElement(pill);
    await expect(label.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      title.getBoundingClientRect().top + 1
    );
    await expect(middle(pill)).toBeCloseTo(middle(title), 0);
    await expect(pill.getBoundingClientRect().right).toBeLessThanOrEqual(
      card.getBoundingClientRect().right
    );
    await expect(getComputedStyle(title).fontWeight).toBe('700');
    await expect(getComputedStyle(label).color).toBe(tokenColour('--ds-color-fg-muted'));
    await expect(getComputedStyle(card).backgroundColor).toBe(tokenColour('--ds-color-bg-raised'));
    await expect(getComputedStyle(card).borderTopColor).toBe(
      tokenColour('--ds-color-border-subtle')
    );
    await expect(getComputedStyle(card).boxShadow).toBe('none');
    await expect(canvasElement.querySelector('.ds-card__body')).toBeNull();
  },
};

export const WithAction: Story = {
  args: {
    label: 'Tomorrow, 20:45',
    title: 'Portugal – Chile',
    end: (
      <Button size="sm" onClick={pick}>
        Pick
      </Button>
    ),
  },
  play: async ({ canvas, userEvent }) => {
    pick.mockClear();
    const button = canvas.getByRole('button', { name: 'Pick' });
    await expect(middle(button)).toBeCloseTo(middle(canvas.getByText('Portugal – Chile')), 0);
    await userEvent.click(button);
    await expect(pick).toHaveBeenCalledTimes(1);
  },
};

export const LinkedTitle: Story = {
  args: {
    title: <RouterLink href="#/matches/12">Spain – Italy</RouterLink>,
    end: (
      <Button size="sm" onClick={pick}>
        Pick
      </Button>
    ),
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    pick.mockClear();
    const link = canvas.getByRole('link', { name: 'Spain – Italy' });
    await expect(link).toHaveAttribute('data-router', 'demo');
    await expect(getComputedStyle(link).textDecorationLine).toBe('none');
    await expect(getComputedStyle(link).color).toBe(tokenColour('--ds-color-fg-default'));
    const label = partOf(canvasElement, 'label').getBoundingClientRect();
    await expect(
      document.elementFromPoint(label.left + label.width / 2, label.top + label.height / 2)
    ).toBe(link);
    const card = canvasElement.querySelector('.ds-card')?.getBoundingClientRect();
    if (!card) throw new Error('The card is missing');
    await expect(document.elementFromPoint(card.left + 4, card.bottom - 4)).toBe(link);
    const button = canvas.getByRole('button', { name: 'Pick' });
    const box = button.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    await expect(hit && button.contains(hit)).toBe(true);
    const before = window.location.hash;
    await userEvent.click(button);
    await expect(pick).toHaveBeenCalledTimes(1);
    await expect(window.location.hash).toBe(before);
    button.blur();
    await userEvent.tab();
    await expect(link).toHaveFocus();
  },
};

export const WithContent: Story = {
  render: () => (
    <Card className="extra">
      <p style={{ margin: 0 }}>The run stopped at 14:32 after the daily loss limit.</p>
    </Card>
  ),
  play: async ({ canvas, canvasElement }) => {
    await expect(canvasElement.querySelector('.ds-card')).toHaveClass('extra');
    await expect(partOf(canvasElement, 'body')).toContainElement(
      canvas.getByText(/^The run stopped/)
    );
    await expect(canvasElement.querySelector('.ds-card__label')).toBeNull();
    await expect(canvasElement.querySelector('.ds-card__row')).toBeNull();
  },
};

export const EndOnly: Story = {
  render: () => <Card end={<Pill tone="success">Saved</Pill>} />,
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.ds-card__row')).not.toBeNull();
    await expect(canvasElement.querySelector('.ds-card__title')).toBeNull();
    await expect(partOf(canvasElement, 'end')).toHaveTextContent('Saved');
  },
};

export const TitleOnly: Story = {
  render: () => <Card title="Mean reversion" />,
  play: async ({ canvasElement }) => {
    await expect(partOf(canvasElement, 'title')).toHaveTextContent('Mean reversion');
    await expect(canvasElement.querySelector('.ds-card__end')).toBeNull();
    await expect(canvasElement.querySelector('.ds-card__label')).toBeNull();
  },
};

export const LongTitleOnAPhone: Story = {
  globals: { viewport: { value: 'phone', isRotated: false } },
  args: {
    title: 'Borussia Mönchengladbach – Wolverhampton Wanderers, the replay of the cup tie',
    end: <Pill tone="success">Saved</Pill>,
  },
  play: async ({ canvas, canvasElement }) => {
    const card = canvasElement.querySelector('.ds-card')?.getBoundingClientRect();
    const title = partOf(canvasElement, 'title').getBoundingClientRect();
    if (!card) throw new Error('The card is missing');
    await expect(canvas.getByText('Saved').getBoundingClientRect().right).toBeLessThanOrEqual(
      card.right
    );
    await expect(title.height).toBeGreaterThan(40);
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

export const AList: Story = {
  render: () => (
    <ul style={list}>
      <li>
        <Card
          label="Today, 21:00"
          title={<RouterLink href="#/matches/12">Spain – Italy</RouterLink>}
          end={<Pill>Your pick 2–1</Pill>}
        />
      </li>
      <li>
        <Card
          label="Today, 18:00"
          title={<RouterLink href="#/matches/11">France – Brazil</RouterLink>}
          end={<Pill tone="success">Saved</Pill>}
        />
      </li>
      <li>
        <Card
          label="Tomorrow, 20:45"
          title={<RouterLink href="#/matches/13">Portugal – Chile</RouterLink>}
          end={
            <Button size="sm" onClick={pick}>
              Pick
            </Button>
          }
        />
      </li>
    </ul>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('listitem')).toHaveLength(3);
    await expect(canvas.getAllByRole('link')).toHaveLength(3);
    const [first, second] = canvas.getAllByRole('listitem');
    if (!first || !second) throw new Error('A card is missing');
    await expect(second.getBoundingClientRect().top).toBeGreaterThan(
      first.getBoundingClientRect().bottom
    );
  },
};

export const ServerMarkup: Story = {
  play: async () => {
    const html = renderToString(
      <Card
        label="Run 42"
        title="BTC-EUR · mean reversion"
        end={<Pill tone="success">Live</Pill>}
      />
    );
    await expect(html).toBe(
      '<div class="ds-card"><div class="ds-card__label">Run 42</div><div class="ds-card__row"><div class="ds-card__title">BTC-EUR · mean reversion</div><div class="ds-card__end"><span class="ds-pill" data-tone="success">Live</span></div></div></div>'
    );
    await expect(renderToString(<Card>Notes</Card>)).toBe(
      '<div class="ds-card"><div class="ds-card__body">Notes</div></div>'
    );
  },
};
