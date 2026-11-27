import { describe, expect, it } from 'vitest';
import { isMode, modeFrom, modes } from './mode.ts';

describe('the mode of the page', () => {
  it('is one of three: the system setting, light or dark', () => {
    expect(modes).toEqual(['system', 'light', 'dark']);
    expect(isMode('dark')).toBe(true);
    expect(isMode('sepia')).toBe(false);
    expect(isMode(undefined)).toBe(false);
  });

  it('follows the system setting when the cookie holds nothing it knows', () => {
    expect(modeFrom('light')).toBe('light');
    expect(modeFrom('sepia')).toBe('system');
    expect(modeFrom(undefined)).toBe('system');
  });
});
