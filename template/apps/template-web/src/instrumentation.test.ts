import { afterEach, describe, expect, it, vi } from 'vitest';

const node = vi.hoisted(() => ({ start: vi.fn() }));

vi.mock('./lib/start.ts', () => ({ start: node.start }));

const { register } = await import('./instrumentation.ts');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('register', () => {
  it('starts the app in the Node.js runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');

    await register();

    expect(node.start).toHaveBeenCalledTimes(1);
  });

  it('does nothing in any other runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge');

    await register();

    expect(node.start).not.toHaveBeenCalled();
  });
});
