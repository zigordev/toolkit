import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultTheme, modes, products, themeAttributes } from './index.ts';

const css = readFileSync(new URL('../dist/tokens.css', import.meta.url), 'utf8');

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) {
    throw new Error(`tokens.css has no block for ${selector}`);
  }
  return css.slice(start, css.indexOf('}', start));
}

function value(scope: string, name: string): string | undefined {
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(scope);
  return match?.[1]?.trim();
}

function names(scope: string): string[] {
  return [...scope.matchAll(/(--ds-[a-z0-9-]+):/g)].map((match) => match[1] ?? '');
}

describe('the theme', () => {
  it('is dark by default, with light as the other mode', () => {
    expect(defaultTheme).toEqual({ mode: 'dark' });
    expect(modes).toEqual(['light', 'dark']);
    expect(themeAttributes.mode).toBe('data-mode');
  });

  it('names the products that wear their own colours, chosen with data-product', () => {
    expect(products).toEqual(['gpool', 'trading-bot', 'cv']);
    expect(themeAttributes.product).toBe('data-product');
  });
});

describe('tokens.css', () => {
  const root = block(':root');
  const light = block(':root[data-mode="light"]');
  const system = block(':root[data-mode="system"]');

  it('sits in the layer ds.tokens, so a component layer always wins over it', () => {
    expect(css.match(/@layer ds\.tokens \{/g)).toHaveLength(2 + products.length);
  });

  it('gives the page the dark half of each colour ramp unless a mode says otherwise', () => {
    expect(value(root, '--ds-color-scale-neutral-1')).toBe(
      'var(--ds-color-palette-neutral-dark-1)'
    );
    expect(value(light, '--ds-color-scale-neutral-1')).toBe(
      'var(--ds-color-palette-neutral-light-1)'
    );
  });

  it('follows the system to light only when the page asks for it', () => {
    expect(css).toContain('@media (prefers-color-scheme: light)');
    expect(value(system, '--ds-color-scale-accent-9')).toBe(
      value(light, '--ds-color-scale-accent-9')
    );
  });

  it('keeps the shared look: the precise corners and Mona Sans', () => {
    expect(value(root, '--ds-color-accent-solid')).toBe('var(--ds-color-scale-accent-9)');
    expect(value(root, '--ds-radius-button')).toBe('var(--ds-radius-sm)');
    expect(value(root, '--ds-font-family-sans')).toMatch(/^"Mona Sans Variable"/);
  });

  it("gives a page without a product the template's colours: lavender on anthracite", () => {
    expect(value(root, '--ds-color-palette-accent-dark-9')).toBe('oklch(76% 0.12 295)');
    expect(value(root, '--ds-color-palette-neutral-dark-1')).toBe('oklch(25.5% 0.013 215)');
  });

  it('changes nothing but the mode-owned tokens in light mode', () => {
    expect(value(light, '--ds-radius-button')).toBeUndefined();
    expect(value(light, '--ds-font-family-sans')).toBeUndefined();
  });

  it.each([
    ['gpool', 'mint', 175, 'pine', 168],
    ['trading-bot', 'copper', 52, 'plum', 318],
    ['cv', 'lavender', 295, 'midnight', 262],
  ])(
    'dresses %s in its own colours: a %s accent on %s',
    (product, _accent, accentHue, _bg, bgHue) => {
      const scope = block(`:root[data-product="${product}"]`);
      expect(value(scope, '--ds-color-palette-accent-dark-9')).toMatch(
        new RegExp(` ${accentHue}\\)$`)
      );
      expect(value(scope, '--ds-color-palette-neutral-dark-1')).toMatch(
        new RegExp(` ${bgHue}\\)$`)
      );
    }
  );

  it.each(products)('changes only the colour palettes for %s', (product) => {
    const declared = names(block(`:root[data-product="${product}"]`));
    expect(declared.length).toBeGreaterThan(0);
    expect(declared.every((name) => name.startsWith('--ds-color-palette-'))).toBe(true);
  });
});
