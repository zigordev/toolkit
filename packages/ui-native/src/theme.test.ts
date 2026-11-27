import { describe, expect, it } from 'vitest';
import { lineHeight, resolveMode } from './theme.ts';

describe('resolveMode', () => {
  it('follows the phone when the app asks for the system mode', () => {
    expect(resolveMode('system', 'light')).toBe('light');
    expect(resolveMode('system', 'dark')).toBe('dark');
  });

  it('falls back to dark, the default of the tokens, when the phone says nothing', () => {
    expect(resolveMode('system', null)).toBe('dark');
    expect(resolveMode('system', undefined)).toBe('dark');
  });

  it('keeps a mode the app chose', () => {
    expect(resolveMode('light', 'dark')).toBe('light');
    expect(resolveMode('dark', 'light')).toBe('dark');
  });
});

describe('lineHeight', () => {
  it('turns a ratio of the tokens into whole pixels', () => {
    expect(lineHeight(15, 1.15)).toBe(17);
    expect(lineHeight(16, 1.5)).toBe(24);
  });
});
