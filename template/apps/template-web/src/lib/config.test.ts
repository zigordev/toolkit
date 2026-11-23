import { ConfigError } from '@zigordev/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readConfig } from './config.ts';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('readConfig', () => {
  it('needs the name of the service and the address of the API', () => {
    expect(
      readConfig({ OTEL_SERVICE_NAME: 'template-web', API_URL: 'http://template-api:3000' })
    ).toEqual({
      LOG_LEVEL: 'info',
      OTEL_SERVICE_NAME: 'template-web',
      API_URL: 'http://template-api:3000',
    });
  });

  it('refuses to start without them, and names both', () => {
    let error: unknown;
    try {
      readConfig({});
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).issues.map((issue) => issue.variable)).toEqual([
      'OTEL_SERVICE_NAME',
      'API_URL',
    ]);
  });
});

describe('getConfig', () => {
  it('reads the environment of the process once', async () => {
    vi.stubEnv('OTEL_SERVICE_NAME', 'template-web');
    vi.stubEnv('API_URL', 'http://template-api:3000');
    const { getConfig } = await import('./config.ts');

    const first = getConfig();
    vi.stubEnv('API_URL', 'http://elsewhere:3000');

    expect(getConfig()).toBe(first);
    expect(first.API_URL).toBe('http://template-api:3000');
  });
});
