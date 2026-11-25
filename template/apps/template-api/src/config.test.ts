import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { ConfigError } from '@zigordev/config';
import { describe, expect, it } from 'vitest';
import { kafkaOf, readConfig, readMigrateConfig, signInOf } from './config.ts';

const development = parseEnv(readFileSync(new URL('../.env.development', import.meta.url), 'utf8'));
const database = 'postgresql://template_api@127.0.0.1:5433/template_api';
const digest = 'a'.repeat(64);

function issues(read: () => unknown): string[] {
  try {
    read();
  } catch (error) {
    return (error as ConfigError).issues.map((issue) => issue.variable);
  }
  return [];
}

describe('readConfig', () => {
  it('needs the name of the service and the database, and fills in the rest', () => {
    expect(readConfig({ OTEL_SERVICE_NAME: 'template-api', DATABASE_URL: database })).toEqual({
      PORT: 3000,
      HOST: '0.0.0.0',
      LOG_LEVEL: 'info',
      OTEL_SERVICE_NAME: 'template-api',
      DATABASE_URL: database,
      API_KEYS: [],
      FLAGS_FILE: fileURLToPath(new URL('../flags.json', import.meta.url)),
    });
  });

  it('reads the API keys as JSON, each with its name, its digest and its scopes', () => {
    const config = readConfig({
      OTEL_SERVICE_NAME: 'template-api',
      DATABASE_URL: database,
      API_KEYS: JSON.stringify([{ name: 'template-web', sha256: digest, scopes: ['notes:read'] }]),
    });

    expect(config.API_KEYS).toEqual([
      { name: 'template-web', sha256: digest, scopes: ['notes:read'] },
    ]);
  });

  it('refuses to start without a name, without a database, or with a port that is none', () => {
    expect(issues(() => readConfig({ PORT: '70000' }))).toEqual([
      'OTEL_SERVICE_NAME',
      'DATABASE_URL',
      'PORT',
    ]);
  });

  it.each([
    ['text that is not JSON', 'not json'],
    [
      'a key with a scope nobody knows',
      JSON.stringify([{ name: 'a', sha256: digest, scopes: ['all'] }]),
    ],
    ['a digest that is no SHA-256', JSON.stringify([{ name: 'a', sha256: 'abc', scopes: [] }])],
  ])('refuses API keys given as %s, and names the field', (_name, keys) => {
    expect(
      issues(() =>
        readConfig({ OTEL_SERVICE_NAME: 'template-api', DATABASE_URL: database, API_KEYS: keys })
      )
    ).toEqual([expect.stringMatching(/^API_KEYS/)]);
  });

  it('refuses a database address that is not PostgreSQL', () => {
    expect(
      issues(() => readConfig({ OTEL_SERVICE_NAME: 'template-api', DATABASE_URL: 'mysql://db/x' }))
    ).toEqual(['DATABASE_URL']);
  });

  it('reads the environment of the process when it is given none', () => {
    expect(() => readConfig()).toThrow(ConfigError);
    expect(() => readMigrateConfig()).toThrow(ConfigError);
  });
});

const base = { OTEL_SERVICE_NAME: 'template-api', DATABASE_URL: database };
const kafka = {
  KAFKA_BROKERS: 'kafka:9092',
  KAFKA_USERNAME: 'template-api',
  KAFKA_PASSWORD: 'local-only-template-api',
};

describe('the Kafka settings', () => {
  it('leave Kafka off when none is given', () => {
    expect(kafkaOf(readConfig(base))).toBeUndefined();
  });

  it('reach Kafka as the app, with all three', () => {
    expect(kafkaOf(readConfig({ ...base, ...kafka, KAFKA_BROKERS: 'one:9092, two:9093' }))).toEqual(
      {
        clientId: 'template-api',
        brokers: ['one:9092', 'two:9093'],
        username: 'template-api',
        password: 'local-only-template-api',
      }
    );
  });

  it('refuse some of them without the others', () => {
    expect(issues(() => readConfig({ ...base, KAFKA_BROKERS: 'kafka:9092' }))).toEqual([
      'KAFKA_USERNAME',
      'KAFKA_PASSWORD',
    ]);
    expect(issues(() => readConfig({ ...base, ...kafka, KAFKA_PASSWORD: '' }))).toEqual([
      'KAFKA_PASSWORD',
    ]);
  });

  it('refuse a broker that is no host and port', () => {
    expect(issues(() => readConfig({ ...base, ...kafka, KAFKA_BROKERS: 'kafka' }))).toEqual([
      expect.stringMatching(/^KAFKA_BROKERS/),
    ]);
  });
});

describe('the sign-in settings', () => {
  const secret = 'a-secret-that-is-at-least-thirty-two-characters-long';
  const on = {
    ...base,
    ...kafka,
    AUTH_SECRET: secret,
    AUTH_URL: 'http://template.localhost',
  };

  it('leave sign-in off when there is no secret and no address', () => {
    expect(signInOf(readConfig(base))).toBeUndefined();
  });

  it('turn sign-in on with a secret, an address and Kafka, and Google only with both of its values', () => {
    expect(signInOf(readConfig(on))?.methods).toEqual(['email', 'passkey']);
    const google = signInOf(
      readConfig({ ...on, AUTH_GOOGLE_CLIENT_ID: 'id', AUTH_GOOGLE_CLIENT_SECRET: 'secret' })
    );
    expect(google?.methods).toEqual(['email', 'passkey', 'google']);
    expect(google?.config).toMatchObject({
      AUTH_URL: 'http://template.localhost',
      AUTH_GOOGLE_CLIENT_ID: 'id',
    });
  });

  it('refuse half of the sign-in settings', () => {
    expect(issues(() => readConfig({ ...base, ...kafka, AUTH_SECRET: secret }))).toEqual([
      'AUTH_URL',
    ]);
    expect(
      issues(() => readConfig({ ...base, ...kafka, AUTH_URL: 'http://template.localhost' }))
    ).toEqual(['AUTH_SECRET']);
    expect(issues(() => readConfig({ ...on, AUTH_GOOGLE_CLIENT_ID: 'id' }))).toEqual([
      'AUTH_GOOGLE_CLIENT_SECRET',
    ]);
    expect(issues(() => readConfig({ ...on, AUTH_GOOGLE_CLIENT_SECRET: 'secret' }))).toEqual([
      'AUTH_GOOGLE_CLIENT_ID',
    ]);
  });

  it('refuse sign-in without Kafka, which carries its emails to the notifications service', () => {
    const {
      KAFKA_BROKERS: _brokers,
      KAFKA_USERNAME: _user,
      KAFKA_PASSWORD: _password,
      ...alone
    } = on;

    expect(issues(() => readConfig(alone))).toEqual([
      'KAFKA_BROKERS',
      'KAFKA_USERNAME',
      'KAFKA_PASSWORD',
    ]);
  });

  it('turn sign-in on over https too, now that its emails leave the app', () => {
    expect(
      signInOf(readConfig({ ...on, AUTH_URL: 'https://template.zigordev.com' }))?.config.AUTH_URL
    ).toBe('https://template.zigordev.com');
  });
});

describe('readMigrateConfig', () => {
  it('takes the address of the app and, when there is one, the address of the superuser', () => {
    expect(
      readMigrateConfig({
        OTEL_SERVICE_NAME: 'template-api-migrate',
        DATABASE_URL: database,
        DATABASE_ADMIN_URL: 'postgresql://postgres@127.0.0.1:5433/postgres',
        API_KEYS: 'not read here',
      })
    ).toEqual({
      LOG_LEVEL: 'info',
      OTEL_SERVICE_NAME: 'template-api-migrate',
      DATABASE_URL: database,
      DATABASE_ADMIN_URL: 'postgresql://postgres@127.0.0.1:5433/postgres',
    });
  });
});

describe('the settings of pnpm dev', () => {
  it('pass the same check as in the container, and keep the server on this Mac', () => {
    expect(readConfig(development)).toMatchObject({
      PORT: 3000,
      HOST: '127.0.0.1',
      OTEL_SERVICE_NAME: 'template-api',
      OTEL_SERVICE_VERSION: 'dev',
      DATABASE_URL: expect.stringMatching(
        /^postgresql:\/\/template_api:[^@]+@127\.0\.0\.1:5433\/template_api$/
      ),
    });
  });

  it('turn sign-in on for the web app on this Mac, and reach Kafka on this Mac as the app', () => {
    const config = readConfig(development);

    expect(signInOf(config)?.config.AUTH_URL).toBe('http://localhost:3001');
    expect(signInOf(config)?.methods).toEqual(['email', 'passkey']);
    expect(kafkaOf(config)).toMatchObject({
      brokers: ['localhost:9094'],
      username: 'template-api',
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
