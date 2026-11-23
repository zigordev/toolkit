import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { ConfigError } from '@zigordev/config';
import { describe, expect, it } from 'vitest';
import { readConfig } from './config.ts';

const development = parseEnv(readFileSync(new URL('../.env.development', import.meta.url), 'utf8'));

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

describe('the settings of pnpm dev', () => {
  it('pass the same check as in the container, and keep the server on this Mac', () => {
    expect(readConfig(development)).toEqual({
      PORT: 3000,
      HOST: '127.0.0.1',
      LOG_LEVEL: 'info',
      OTEL_SERVICE_NAME: 'template-api',
      OTEL_SERVICE_VERSION: 'dev',
    });
  });

  it('send the telemetry to the agent on this Mac, and give up on a send within a second', () => {
    expect(development).toMatchObject({
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318',
      OTEL_EXPORTER_OTLP_TIMEOUT: '1000',
      OTEL_RESOURCE_ATTRIBUTES: 'deployment.environment.name=local',
    });
  });
});
