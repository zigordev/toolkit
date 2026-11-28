import type { Meta, StoryObj } from '@storybook/react-vite';
import { renderToString } from 'react-dom/server';
import { expect } from 'storybook/test';
import { Tile, Tiles } from './tile.tsx';

function tokenColour(token: string): string {
  const probe = document.createElement('span');
  probe.style.setProperty('color', `var(${token})`);
  document.body.append(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}

function tilesOf(canvasElement: HTMLElement) {
  return [...canvasElement.querySelectorAll<HTMLElement>('.ds-tile')].map((tile) =>
    tile.getBoundingClientRect()
  );
}

const meta = {
  title: 'Components/Tile',
  component: Tile,
  args: { label: 'Points', value: '117' },
  parameters: { layout: 'padded' },
  render: (args) => (
    <Tiles>
      <Tile {...args} />
      <Tile label="Position" value="3rd" />
      <Tile label="Picks left" value="2" />
    </Tiles>
  ),
} satisfies Meta<typeof Tile>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Computer: Story = {
  globals: { viewport: { value: 'computer', isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    const terms = canvas.getAllByRole('term');
    const definitions = canvas.getAllByRole('definition');
    await expect(terms.map((term) => term.textContent)).toEqual([
      'Points',
      'Position',
      'Picks left',
    ]);
    await expect(definitions.map((definition) => definition.textContent)).toEqual([
      '117',
      '3rd',
      '2',
    ]);
    await expect(terms[0]?.closest('dl')).toHaveClass('ds-tiles');
    const [first, second, third] = tilesOf(canvasElement);
    if (!first || !second || !third) throw new Error('A tile is missing');
    await expect(second.top).toBeCloseTo(first.top, 0);
    await expect(third.top).toBeCloseTo(first.top, 0);
    await expect(second.width).toBeCloseTo(first.width, 0);
    await expect(third.width).toBeCloseTo(first.width, 0);
    await expect(second.left).toBeGreaterThan(first.right);
    const value = canvas.getByText('117');
    await expect(getComputedStyle(value).fontWeight).toBe('700');
    await expect(getComputedStyle(value).fontVariantNumeric).toBe('tabular-nums');
    await expect(getComputedStyle(canvas.getByText('Points')).color).toBe(
      tokenColour('--ds-color-fg-muted')
    );
    const tile = canvasElement.querySelector<HTMLElement>('.ds-tile');
    if (!tile) throw new Error('A tile is missing');
    await expect(getComputedStyle(tile).boxShadow).toBe('none');
  },
};

export const Phone: Story = {
  globals: { viewport: { value: 'phone', isRotated: false } },
  play: async ({ canvasElement }) => {
    const [first, second, third] = tilesOf(canvasElement);
    const list = canvasElement.querySelector('.ds-tiles')?.getBoundingClientRect();
    if (!first || !second || !third || !list) throw new Error('A tile is missing');
    await expect(second.top).toBeGreaterThan(first.bottom);
    await expect(third.top).toBeGreaterThan(second.bottom);
    await expect(first.width).toBeCloseTo(list.width, 0);
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

export const TwoTiles: Story = {
  globals: { viewport: { value: 'tablet', isRotated: false } },
  args: { label: 'Open notes', value: '4', className: 'extra' },
  render: (args) => (
    <Tiles className="story-tiles">
      <Tile {...args} />
      <Tile label="Done notes" value="12" />
    </Tiles>
  ),
  play: async ({ canvas, canvasElement }) => {
    await expect(canvasElement.querySelector('.ds-tiles')).toHaveClass('story-tiles');
    await expect(canvas.getByText('Open notes').closest('.ds-tile')).toHaveClass('extra');
    const [first, second] = tilesOf(canvasElement);
    const list = canvasElement.querySelector('.ds-tiles')?.getBoundingClientRect();
    if (!first || !second || !list) throw new Error('A tile is missing');
    await expect(second.top).toBeCloseTo(first.top, 0);
    await expect(first.width + second.width).toBeGreaterThan(list.width * 0.9);
  },
};

export const ServerMarkup: Story = {
  play: async () => {
    await expect(
      renderToString(
        <Tiles>
          <Tile label="Points" value="117" />
        </Tiles>
      )
    ).toBe(
      '<dl class="ds-tiles"><div class="ds-tile"><dt class="ds-tile__label">Points</dt><dd class="ds-tile__value">117</dd></div></dl>'
    );
  },
};
