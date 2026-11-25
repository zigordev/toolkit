import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config.ts';

describe('the Next.js settings', () => {
  it('keep the browser console out of the dev log, which would reload every page forever', () => {
    expect(nextConfig.logging).toEqual({ browserToTerminal: false });
  });
});
