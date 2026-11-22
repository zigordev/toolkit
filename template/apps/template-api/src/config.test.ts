import { ConfigError } from '@zigordev/config';
import { describe, expect, it } from 'vitest';
import { readConfig } from './config.ts';

describe('readConfig', () => {
  it('needs only the name of the service, and fills in the rest', () => {
    expect(readConfig({ OTEL_SERVICE_NAME: 'template-api' })).toEqual({
      PORT: 3000,
      HOST: '0.0.0.0',
      LOG_LEVEL: 'info',
      OTEL_SERVICE_NAME: 'template-api',
    });
  });

  it('takes every setting from the environment', () => {
    const config = readConfig({
      PORT: '8080',
      HOST: '127.0.0.1',
      LOG_LEVEL: 'debug',
      OTEL_SERVICE_NAME: 'template-api',
      OTEL_SERVICE_VERSION: '1f3a9c2',
    });

    expect(config).toEqual({
      PORT: 8080,
      HOST: '127.0.0.1',
      LOG_LEVEL: 'debug',
      OTEL_SERVICE_NAME: 'template-api',
      OTEL_SERVICE_VERSION: '1f3a9c2',
    });
  });

  it('refuses to start without a name, or with a port that is none', () => {
    let error: unknown;
    try {
      readConfig({ PORT: '70000' });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).issues.map((issue) => issue.variable)).toEqual([
      'PORT',
      'OTEL_SERVICE_NAME',
    ]);
  });

  it('reads the environment of the process when it is given none', () => {
    expect(() => readConfig()).toThrow(ConfigError);
  });
});
