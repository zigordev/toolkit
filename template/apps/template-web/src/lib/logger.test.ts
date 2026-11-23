import { afterEach, describe, expect, it, vi } from 'vitest';

const loggerKey = Symbol.for('zigordev.template-web.logger');

afterEach(() => {
  delete (globalThis as { [loggerKey]?: unknown })[loggerKey];
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('getLogger', () => {
  it('makes the logger from the settings, with the name and the version of the app', async () => {
    vi.stubEnv('OTEL_SERVICE_NAME', 'template-web');
    vi.stubEnv('OTEL_SERVICE_VERSION', '1f3a9c2');
    vi.stubEnv('LOG_LEVEL', 'warn');
    vi.stubEnv('API_URL', 'http://template-api:3000');
    const { getLogger } = await import('./logger.ts');

    const logger = getLogger();

    expect(logger.bindings()).toEqual({ service: 'template-web', release: '1f3a9c2' });
    expect(logger.level).toBe('warn');
  });

  it('makes one logger for the whole process, and hands out that one each time', async () => {
    vi.stubEnv('OTEL_SERVICE_NAME', 'template-web');
    vi.stubEnv('API_URL', 'http://template-api:3000');
    const first = (await import('./logger.ts')).getLogger();
    vi.resetModules();

    const second = (await import('./logger.ts')).getLogger();

    expect(second).toBe(first);
  });
});
