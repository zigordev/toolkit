import { afterEach, describe, expect, it, vi } from 'vitest';
import { setMode } from './mode.ts';

const jar = vi.hoisted(() => ({ set: vi.fn() }));

vi.mock('next/headers', () => ({ cookies: async () => jar }));

afterEach(() => {
  jar.set.mockClear();
});

describe('choosing light or dark', () => {
  it('keeps the choice in a cookie for a year, which the layout reads on the next render', async () => {
    await setMode('dark');

    expect(jar.set).toHaveBeenCalledWith('template.mode', 'dark', {
      path: '/',
      maxAge: 31_536_000,
      sameSite: 'lax',
      httpOnly: true,
    });
  });

  it('ignores a mode it does not know', async () => {
    await setMode('sepia');
    await setMode(undefined);

    expect(jar.set).not.toHaveBeenCalled();
  });
});
