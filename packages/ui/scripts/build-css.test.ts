import { describe, expect, it } from 'vitest';
import { bundleCss } from './build-css.ts';
import { supportedBrowsers } from './targets.ts';

describe('the CSS bundle', () => {
  it('is one file with the tokens, the reset, the base styles and the Button, in their layers', async () => {
    const css = await bundleCss();

    const layers = [...css.matchAll(/@layer ([a-z.]+)[{;]/g)].map(([, name]) => name);
    expect([...new Set(layers)]).toEqual([
      'ds.reset',
      'ds.tokens',
      'ds.base',
      'ds.components',
      'ds.utilities',
    ]);
    expect(css).toContain('--ds-color-accent-solid:');
    expect(css).toContain(':root[data-mode=light]');
    expect(css).toContain('.ds-button');
    expect(css).not.toContain('@import');
  });

  it('keeps no comment and no line break of the sources', async () => {
    const css = await bundleCss();

    expect(css).not.toContain('/*');
    expect(css.trim()).not.toContain('\n');
  });
});

describe('the browsers it supports', () => {
  it('are the versions that have the layers, nesting and colour functions it uses', () => {
    expect(supportedBrowsers).toEqual({
      chrome: [111, 0],
      edge: [111, 0],
      firefox: [113, 0],
      safari: [16, 4],
      ios_saf: [16, 4],
    });
  });
});
