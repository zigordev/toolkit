import { type Mode, modes, type Product, products } from '../index.ts';
import { rgbOf } from '../palette/color.ts';

export type Declarations = Record<string, string>;
export type NativeEasing = readonly [number, number, number, number];
export type NativeValue = string | number | NativeEasing;
export type NativeTheme = Record<string, NativeValue>;
export type Palette = 'default' | Product;

type Kind = 'string' | 'number' | 'weight' | 'easing';

const blockPattern = /(:root(?:\[data-[a-z]+="[^"]+"\])?)\s*\{([^{}]*)\}/g;
const declarationPattern = /(--ds-[\w-]+)\s*:\s*([^;]+);/g;
const variablePattern = /var\((--ds-[\w-]+)\)/g;
const colourPattern = /oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)/g;
const lengthPattern = /^(-?\d*\.?\d+)(rem|px)$/;
const durationPattern = /^(\d*\.?\d+)ms$/;
const easingPattern = /^cubic-bezier\(([^)]+)\)$/;
const numberPattern = /^-?\d*\.?\d+$/;
const rootSize = 16;
const palettes: Palette[] = ['default', ...products];
const genericFamilies = new Set(['system-ui', '-apple-system', 'sans-serif', 'serif', 'monospace']);

export function parseBlocks(css: string): Map<string, Declarations> {
  const blocks = new Map<string, Declarations>();
  for (const [, selector = '', body = ''] of css.matchAll(blockPattern)) {
    const declarations: Declarations = { ...blocks.get(selector) };
    for (const [, name = '', value = ''] of body.matchAll(declarationPattern)) {
      declarations[name] = value.trim();
    }
    blocks.set(selector, declarations);
  }
  return blocks;
}

export function declarationsOf(
  blocks: Map<string, Declarations>,
  palette: Palette,
  mode: Mode
): Declarations {
  return {
    ...blocks.get(':root'),
    ...(palette === 'default' ? {} : blocks.get(`:root[data-product="${palette}"]`)),
    ...(mode === 'light' ? blocks.get(':root[data-mode="light"]') : {}),
  };
}

export function resolve(name: string, declarations: Declarations, seen: string[] = []): string {
  const value = declarations[name];
  if (value === undefined) {
    throw new Error(`${name} is not defined`);
  }
  if (seen.includes(name)) {
    throw new Error(`${[...seen, name].join(' -> ')} is circular`);
  }
  return value.replace(variablePattern, (_, inner: string) =>
    resolve(inner, declarations, [...seen, name])
  );
}

function colour(lightness: string, chroma: string, hue: string, alpha: string | undefined) {
  const [r, g, b] = rgbOf({ l: Number(lightness) / 100, c: Number(chroma), h: Number(hue) });
  if (alpha !== undefined && Number(alpha) < 1) {
    return `rgba(${r}, ${g}, ${b}, ${Number(alpha)})`;
  }
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

export function nativeColours(value: string): string {
  return value.replace(colourPattern, (_, l: string, c: string, h: string, a?: string) =>
    colour(l, c, h, a)
  );
}

function primaryFamily(stack: string): string {
  const families = stack.split(',').map((family) => family.trim().replace(/^"|"$/g, ''));
  const family = families.find((name) => !name.endsWith(' Variable') && !genericFamilies.has(name));
  if (family === undefined) {
    throw new Error(`${stack} names no family a phone can load`);
  }
  return family;
}

function kindOf(name: string, value: string): Kind {
  if (/(^|-)weight(-|$)/.test(name) && numberPattern.test(value)) return 'weight';
  if (easingPattern.test(value)) return 'easing';
  if (lengthPattern.test(value) || durationPattern.test(value) || numberPattern.test(value)) {
    return 'number';
  }
  return 'string';
}

export function nativeValue(name: string, value: string): NativeValue {
  const length = lengthPattern.exec(value);
  const duration = durationPattern.exec(value);
  const easing = easingPattern.exec(value);
  switch (kindOf(name, value)) {
    case 'weight':
      return value;
    case 'easing':
      return (easing?.[1] ?? '').split(',').map(Number) as unknown as NativeEasing;
    case 'number':
      if (length) return Number(length[1]) * (length[2] === 'rem' ? rootSize : 1);
      if (duration) return Number(duration[1]);
      return Number(value);
    default:
      break;
  }
  if (name.startsWith('font-family-')) return primaryFamily(value);
  if (value.startsWith('oklch(') || name.startsWith('shadow-')) return nativeColours(value);
  throw new Error(`--ds-${name}: ${value} is not a value React Native can take`);
}

export function nativeTheme(declarations: Declarations): NativeTheme {
  const theme: NativeTheme = {};
  for (const variable of Object.keys(declarations).sort()) {
    if (variable.startsWith('--ds-color-palette-')) continue;
    const name = variable.slice('--ds-'.length);
    theme[name] = nativeValue(name, resolve(variable, declarations));
  }
  return theme;
}

export function nativeTables(css: string): Record<Palette, Record<Mode, NativeTheme>> {
  const blocks = parseBlocks(css);
  const tables = {} as Record<Palette, Record<Mode, NativeTheme>>;
  for (const palette of palettes) {
    tables[palette] = {} as Record<Mode, NativeTheme>;
    for (const mode of modes) {
      tables[palette][mode] = nativeTheme(declarationsOf(blocks, palette, mode));
    }
  }
  return tables;
}

const types: Record<Kind, string> = {
  string: 'string',
  number: 'number',
  weight: 'NativeFontWeight',
  easing: 'NativeEasing',
};

export function nativeModule(css: string): string {
  const blocks = parseBlocks(css);
  const tables = nativeTables(css);
  const resolved = declarationsOf(blocks, 'default', 'dark');
  const names = Object.keys(tables.default.dark);
  for (const palette of palettes) {
    for (const mode of modes) {
      const keys = Object.keys(tables[palette][mode]);
      if (keys.join() !== names.join()) {
        throw new Error(`the ${palette} ${mode} tokens differ in their names from the default`);
      }
    }
  }
  const fields = names.map(
    (name) => `  readonly '${name}': ${types[kindOf(name, resolve(`--ds-${name}`, resolved))]};`
  );
  return [
    "import type { Mode, Product } from '../index.ts';",
    '',
    "export type NativeFontWeight = '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';",
    '',
    'export type NativeEasing = readonly [number, number, number, number];',
    '',
    'export interface NativeTokens {',
    ...fields,
    '}',
    '',
    `export const nativeTokens: Readonly<Record<'default' | Product, Readonly<Record<Mode, NativeTokens>>>> = ${JSON.stringify(tables, null, 2)} as const;`,
    '',
  ].join('\n');
}
