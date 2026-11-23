import { afterEach, describe, expect, it, vi } from 'vitest';

const otel = vi.hoisted(() => ({ logProcessCrashes: vi.fn(), logStarted: vi.fn() }));
const logger = { name: 'logger' };

vi.mock('@zigordev/otel', () => ({
  logProcessCrashes: otel.logProcessCrashes,
  logStarted: otel.logStarted,
}));
vi.mock('./lib/logger.ts', () => ({ getLogger: () => logger }));

const { register } = await import('./instrumentation.ts');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('register', () => {
  it('watches for crashes and writes service.started, in the Node.js runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');

    await register();

    expect(otel.logProcessCrashes).toHaveBeenCalledWith(logger);
    expect(otel.logStarted).toHaveBeenCalledWith(logger);
  });

  it('does nothing in any other runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge');

    await register();

    expect(otel.logStarted).not.toHaveBeenCalled();
  });
});
