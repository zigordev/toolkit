import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { ConfigError } from '@zigordev/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { environmentOf, readConfig } from './config.ts';

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

describe('browser monitoring', () => {
  it("takes a path on the app's own address, and refuses another origin", () => {
    const base = { OTEL_SERVICE_NAME: 'template-web', API_URL: 'http://template-api:3000' };

    expect(readConfig({ ...base, RUM_URL: '/rum' }).RUM_URL).toBe('/rum');
    expect(() => readConfig({ ...base, RUM_URL: 'https://collector.example.com' })).toThrow(
      ConfigError
    );
    expect(() => readConfig({ ...base, RUM_URL: '//collector.example.com' })).toThrow(ConfigError);
  });

  it('names the environment that OpenTelemetry names, or none', () => {
    expect(environmentOf('service.namespace=zigordev,deployment.environment.name=local')).toBe(
      'local'
    );
    expect(environmentOf('deployment.environment.name=')).toBeUndefined();
    expect(environmentOf('service.namespace=zigordev')).toBeUndefined();
    expect(environmentOf(undefined)).toBeUndefined();
  });
});

describe('the settings of pnpm dev', () => {
  it('pass the same check as in the container, and reach the API through the ingress', () => {
    const development = parseEnv(
      readFileSync(new URL('../../.env.development', import.meta.url), 'utf8')
    );

    expect(readConfig(development)).toEqual({
      LOG_LEVEL: 'info',
      OTEL_SERVICE_NAME: 'template-web',
      OTEL_SERVICE_VERSION: 'dev',
      API_URL: 'http://template.localhost',
    });
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
