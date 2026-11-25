import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { transform } from 'lightningcss';
import type { EmailTheme } from '../src/theme.ts';

export type Declarations = Record<string, string>;

const blockPattern = /(:root(?:\[data-[a-z]+="[^"]+"\])?)\s*\{([^{}]*)\}/g;
const declarationPattern = /(--[\w-]+)\s*:\s*([^;]+);/g;
const variablePattern = /var\((--[\w-]+)\)/g;

export function tokensCss(): string {
  const require = createRequire(import.meta.url);
  return readFileSync(require.resolve('@zigordev/tokens/tokens.css'), 'utf8');
}

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

export function hex(value: string): string {
  const { code } = transform({
    filename: 'colour.css',
    code: Buffer.from(`a{color:${value}}`),
    minify: true,
    targets: { safari: 10 << 16 },
  });
  const match = /color:(#[0-9a-f]{3,8})\b/.exec(new TextDecoder().decode(code));
  if (match?.[1] === undefined) {
    throw new Error(`${value} has no hexadecimal form`);
  }
  const short = match[1];
  return short.length === 4
    ? `#${[...short.slice(1)].map((digit) => digit + digit).join('')}`
    : short;
}

export function pixels(value: string, rootSize = 16): string {
  const match = /^(-?\d*\.?\d+)(rem|px)$/.exec(value.trim());
  if (match === null) {
    throw new Error(`${value} is not a rem or px length`);
  }
  const amount = Number(match[1]) * (match[2] === 'rem' ? rootSize : 1);
  return `${Math.round(amount * 100) / 100}px`;
}

export function emailTheme(css: string): EmailTheme {
  const blocks = parseBlocks(css);
  const declarations: Declarations = {
    ...blocks.get(':root'),
    ...blocks.get(':root[data-mode="light"]'),
  };
  const colour = (name: string) => hex(resolve(`--ds-color-${name}`, declarations));
  const length = (name: string) => pixels(resolve(`--ds-${name}`, declarations));
  return {
    colors: {
      page: colour('bg-page'),
      raised: colour('bg-raised'),
      text: colour('fg-default'),
      muted: colour('fg-muted'),
      border: colour('border-subtle'),
      accent: colour('accent-solid'),
      accentOn: colour('accent-on'),
      accentText: colour('accent-text'),
    },
    font: resolve('--ds-font-family-sans', declarations),
    fontSize: {
      sm: length('font-size-sm'),
      md: length('font-size-md'),
      xl: length('font-size-xl'),
    },
    space: { sm: length('space-2'), md: length('space-4'), lg: length('space-8') },
    radius: { button: length('radius-button'), card: length('radius-card') },
    width: length('size-container-sm'),
  };
}

export function themeModule(css: string): string {
  return [
    "import type { EmailTheme } from '../theme.ts';",
    '',
    `export const theme: EmailTheme = ${JSON.stringify(emailTheme(css), null, 2)};`,
    '',
  ].join('\n');
}
