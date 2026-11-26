import { afterEach, describe, expect, it, vi } from 'vitest';
import { go } from './navigate.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('go', () => {
  it('loads the page at the path in full', () => {
    const assign = vi.fn();
    vi.stubGlobal('window', { location: { assign } });

    go('/notes');

    expect(assign).toHaveBeenCalledWith('/notes');
  });
});
