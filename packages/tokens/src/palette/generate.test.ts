import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type Mode, modes, products } from '../index.ts';
import { contrast, type Oklch } from './color.ts';
import { generatedFiles, paletteRamps, scaleAliases, serialize } from './generate.ts';
import { type Palette, palettes, ramps } from './seeds.ts';

interface ScaleDocument {
  color: { scale: Record<string, Record<string, { $value: string }>> };
}

const tokens = new URL('../tokens/', import.meta.url);

function read(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, tokens), 'utf8'));
}

function aliases(document: unknown, path: string[] = [], found: Record<string, string> = {}) {
  if (typeof document !== 'object' || document === null) return found;
  const node = document as Record<string, unknown>;
  if (typeof node.$value === 'string') {
    found[path.join('.')] = node.$value;
    return found;
  }
  for (const [key, value] of Object.entries(node)) {
    if (!key.startsWith('$')) aliases(value, [...path, key], found);
  }
  return found;
}

const roles = aliases(read('base/roles.tokens.json'));

function roleColours(palette: Palette, mode: Mode): (role: string) => Oklch {
  const generated = paletteRamps(palettes[palette]);
  const all = { ...roles, ...aliases(read(`mode/${mode}.tokens.json`)) };
  const resolve = (name: string): Oklch => {
    const target = all[`color.${name}`] ?? '';
    const scale = /^\{color\.scale\.([a-z]+)\.(\d+|on)\}$/.exec(target);
    if (scale) {
      const ramp = generated[scale[1] as keyof typeof generated][mode];
      return scale[2] === 'on' ? ramp.on : (ramp.steps[Number(scale[2]) - 1] as Oklch);
    }
    const other = /^\{color\.(.+)\}$/.exec(target);
    if (other?.[1]) return resolve(other[1]);
    throw new Error(`color.${name} is not a colour role`);
  };
  return resolve;
}

const text = 4.5;
const graphic = 3;

const pairs: [string, string, number][] = [
  ['fg.default', 'bg.page', text],
  ['fg.default', 'bg.raised', text],
  ['fg.default', 'bg.field', text],
  ['fg.default', 'bg.hover', text],
  ['fg.muted', 'bg.page', text],
  ['fg.muted', 'bg.raised', text],
  ['accent.on', 'accent.solid', text],
  ['accent.on', 'accent.solid-hover', text],
  ['neutral.on', 'neutral.solid', text],
  ['neutral.on', 'neutral.solid-hover', text],
  ['danger.on', 'danger.solid', text],
  ['danger.on', 'danger.solid-hover', text],
  ['accent.text', 'bg.page', text],
  ['accent.text', 'bg.raised', text],
  ['accent.text', 'accent.soft', text],
  ['fg.default', 'neutral.soft', text],
  ['fg.default', 'neutral.soft-hover', text],
  ['danger.text', 'bg.page', text],
  ['danger.text', 'bg.raised', text],
  ['danger.text', 'danger.soft', text],
  ['success.text', 'success.soft', text],
  ['warning.text', 'warning.soft', text],
  ['info.text', 'info.soft', text],
  ['fg.default', 'success.soft', text],
  ['fg.default', 'warning.soft', text],
  ['fg.default', 'info.soft', text],
  ['fg.default', 'danger.soft', text],
  ['border.field', 'bg.field', graphic],
  ['border.field', 'bg.page', graphic],
  ['border.field', 'bg.raised', graphic],
  ['focus.ring', 'bg.page', graphic],
  ['focus.ring', 'bg.raised', graphic],
];

const everyPalette: Palette[] = ['default', ...products];

describe('generated token files', () => {
  it.each(Object.entries(generatedFiles()))(
    '%s matches what the generator writes',
    (name, document) => {
      expect(read(`color/${name}`)).toEqual(document);
    }
  );

  it('writes the colours of the template and of every product', () => {
    const names = Object.keys(generatedFiles());
    for (const palette of everyPalette) {
      expect(names).toContain(`${palette}/palette-brand.tokens.json`);
      expect(names).toContain(`${palette}/palette-status.tokens.json`);
    }
  });
});

describe.each(everyPalette)('the colours of %s', (palette) => {
  describe.each(modes)('in %s mode', (mode) => {
    const colour = roleColours(palette, mode);
    it.each(pairs)('give %s on %s at least %s:1', (front, back, minimum) => {
      expect(contrast(colour(front), colour(back))).toBeGreaterThanOrEqual(minimum);
    });
  });
});

describe('the status colours', () => {
  it('move away from the accent of a product where they would look alike', () => {
    expect(palettes.gpool.status.success.seed.h).toBe(135);
    expect(palettes['trading-bot'].status.danger.seed.h).toBe(12);
    expect(palettes.default.status.success.seed.h).toBe(155);
    expect(palettes.default.status.danger.seed.h).toBe(18);
  });
});

describe('roleColours', () => {
  it('refuses a name that is not a colour role', () => {
    expect(() => roleColours('default', 'dark')('not.a.role')).toThrow(/not a colour role/);
  });
});

describe('scaleAliases', () => {
  it('aliases the twelve steps and the text colour of every ramp to the palette of its mode', () => {
    const document = scaleAliases('dark') as ScaleDocument;
    for (const ramp of ramps) {
      const group = document.color.scale[ramp] ?? {};
      expect(Object.keys(group)).toHaveLength(13);
      expect(group['9']?.$value).toBe(`{color.palette.${ramp}.dark.9}`);
      expect(group.on?.$value).toBe(`{color.palette.${ramp}.dark.on}`);
    }
  });
});

describe('serialize', () => {
  it('writes two-space JSON ending in a newline', () => {
    expect(serialize({ a: 1 })).toBe('{\n  "a": 1\n}\n');
  });
});
