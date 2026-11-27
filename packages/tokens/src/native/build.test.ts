import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { modes, products } from '../index.ts';
import { nativeTheme, nativeTokens } from '../native.ts';
import {
  declarationsOf,
  nativeColours,
  nativeModule,
  nativeTables,
  nativeValue,
  parseBlocks,
  resolve,
} from './build.ts';

const css = readFileSync(new URL('../../dist/tokens.css', import.meta.url), 'utf8');
const generated = readFileSync(new URL('../generated/native.ts', import.meta.url), 'utf8');

describe('nativeValue', () => {
  it('turns lengths into pixels, durations into milliseconds and plain numbers into numbers', () => {
    expect(nativeValue('space-4', '1rem')).toBe(16);
    expect(nativeValue('radius-sm', '4px')).toBe(4);
    expect(nativeValue('font-size-sm', '0.8125rem')).toBe(13);
    expect(nativeValue('duration-fast', '120ms')).toBe(120);
    expect(nativeValue('font-line-height-normal', '1.5')).toBe(1.5);
    expect(nativeValue('font-tracking-tight', '-0.02')).toBe(-0.02);
  });

  it('gives font weights as the strings React Native takes', () => {
    expect(nativeValue('font-weight-semibold', '600')).toBe('600');
    expect(nativeValue('font-display-weight', '700')).toBe('700');
  });

  it('gives an easing curve as the four numbers of Easing.bezier', () => {
    expect(nativeValue('easing-standard', 'cubic-bezier(0.2, 0, 0, 1)')).toEqual([0.2, 0, 0, 1]);
  });

  it('names the first family a phone can load, past the web-only variable names', () => {
    expect(
      nativeValue('font-family-sans', '"Mona Sans Variable", "Mona Sans", system-ui, sans-serif')
    ).toBe('Mona Sans');
    expect(() => nativeValue('font-family-sans', 'system-ui, sans-serif')).toThrow(
      /no family a phone can load/
    );
  });

  it('turns colours into hex, or rgba when they are see-through, inside shadows too', () => {
    expect(nativeValue('color-x', 'oklch(76% 0.12 295)')).toBe('#b7a1f5');
    expect(nativeValue('color-bg-scrim', 'oklch(0% 0 0 / 0.6)')).toBe('rgba(0, 0, 0, 0.6)');
    expect(nativeValue('color-x', 'oklch(100% 0 0 / 1)')).toBe('#ffffff');
    expect(nativeColours('0px 1px 2px oklch(20% 0 0 / 0.08)')).toBe(
      '0px 1px 2px rgba(22, 22, 22, 0.08)'
    );
    expect(nativeValue('shadow-raised', '0px 0px 0px 1px oklch(41.5% 0.0205 215)')).toMatch(
      /^0px 0px 0px 1px #[0-9a-f]{6}$/
    );
  });

  it('refuses a value React Native cannot take', () => {
    expect(() => nativeValue('grid-areas', '"top" "main"')).toThrow(/React Native can take/);
  });
});

describe('resolve', () => {
  it('follows var() to the final value', () => {
    expect(resolve('--ds-a', { '--ds-a': 'var(--ds-b)', '--ds-b': '1rem' })).toBe('1rem');
  });

  it('fails on a name that is missing or circular', () => {
    expect(() => resolve('--ds-a', {})).toThrow(/is not defined/);
    expect(() => resolve('--ds-a', { '--ds-a': 'var(--ds-b)', '--ds-b': 'var(--ds-a)' })).toThrow(
      /circular/
    );
  });
});

describe('the native tokens', () => {
  it('are what the generator writes from tokens.css; run pnpm run generate when they differ', () => {
    expect(generated).toBe(nativeModule(css));
  });

  it('give the template and each product its own colours, in each mode', () => {
    expect(nativeTheme({ mode: 'dark' })['color-accent-solid']).toBe('#b7a1f5');
    expect(nativeTheme({ mode: 'dark' })['color-bg-page']).toBe('#1c2527');
    expect(nativeTheme({ mode: 'light' })['color-bg-page']).toBe('#f8f9fa');
    expect(nativeTheme({ mode: 'dark', product: 'trading-bot' })['color-accent-solid']).toBe(
      nativeTables(css)['trading-bot'].dark['color-accent-solid']
    );
    const accents = new Set(
      products.map((product) => nativeTheme({ mode: 'dark', product })['color-accent-solid'])
    );
    expect(accents.size).toBe(products.length);
  });

  it('hold every CSS variable but the palettes behind the scales, with nothing left to resolve', () => {
    const variables = Object.keys(declarationsOf(parseBlocks(css), 'default', 'dark'))
      .filter((name) => !name.startsWith('--ds-color-palette-'))
      .map((name) => name.slice('--ds-'.length))
      .sort();
    for (const product of ['default', ...products] as const) {
      for (const mode of modes) {
        const tokens = nativeTokens[product][mode];
        expect(Object.keys(tokens).sort()).toEqual(variables);
        for (const value of Object.values(tokens)) {
          expect(JSON.stringify(value)).not.toMatch(/var\(|oklch\(/);
        }
      }
    }
  });

  it('refuse tables whose names differ between products', () => {
    const broken = css.replace(
      ':root[data-product="gpool"] {',
      ':root[data-product="gpool"] {\n    --ds-extra-space: 1rem;'
    );
    expect(() => nativeModule(broken)).toThrow(/differ in their names/);
  });
});
