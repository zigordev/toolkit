import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { emailTheme, hex, parseBlocks, pixels, resolve, themeModule, tokensCss } from './theme.ts';

describe('parseBlocks and resolve', () => {
  const css =
    ':root { --a: var(--b); --b: 4px; --loop: var(--loop); }\n:root[data-mode="light"] { --b: 8px; }';

  it('reads each block of declarations, and follows a variable to its value', () => {
    const blocks = parseBlocks(css);

    expect(blocks.get(':root')).toEqual({
      '--a': 'var(--b)',
      '--b': '4px',
      '--loop': 'var(--loop)',
    });
    expect(
      resolve('--a', { ...blocks.get(':root'), ...blocks.get(':root[data-mode="light"]') })
    ).toBe('8px');
  });

  it('refuses a variable that is missing or that leads back to itself', () => {
    const declarations = parseBlocks(css).get(':root') ?? {};

    expect(() => resolve('--none', declarations)).toThrow('--none is not defined');
    expect(() => resolve('--loop', declarations)).toThrow('--loop -> --loop is circular');
  });
});

describe('hex', () => {
  it('turns a colour of the tokens into the six-digit form that every mail client reads', () => {
    expect(hex('oklch(76% 0.12 295)')).toBe('#b7a1f5');
    expect(hex('oklch(100% 0 0)')).toBe('#ffffff');
  });

  it('refuses what is not a colour', () => {
    expect(() => hex('8px')).toThrow('8px has no hexadecimal form');
  });
});

describe('pixels', () => {
  it('turns rem into pixels on a root of 16, and keeps pixels', () => {
    expect(pixels('0.8125rem')).toBe('13px');
    expect(pixels('6px')).toBe('6px');
  });

  it('refuses any other unit', () => {
    expect(() => pixels('1em')).toThrow('1em is not a rem or px length');
  });
});

describe('the theme', () => {
  it('takes the light mode of the brand: the lavender accent, the corners and Mona Sans', () => {
    const theme = emailTheme(tokensCss());

    expect(theme.colors.accent).toBe('#b7a1f5');
    expect(theme.radius).toEqual({ button: '4px', card: '6px' });
    expect(theme.font).toMatch(/^"Mona Sans Variable"/);
  });

  it('is saved as the tokens make it, so a change of a token reaches the emails', () => {
    const saved = readFileSync(new URL('../src/generated/theme.ts', import.meta.url), 'utf8');

    expect(saved).toBe(themeModule(tokensCss()));
  });
});
