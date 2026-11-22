import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod';
import { ConfigError, loadConfig } from './index.ts';

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  APP_NAME: z.string().min(3),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

const valid = {
  DATABASE_URL: 'postgres://db:5432/app',
  APP_NAME: 'gpool-api',
};

afterEach(() => {
  vi.unstubAllEnvs();
});

function configErrorOf(run: () => unknown): ConfigError {
  try {
    run();
  } catch (error) {
    if (error instanceof ConfigError) {
      return error;
    }
    throw error;
  }
  throw new Error('expected loadConfig to throw a ConfigError');
}

describe('loadConfig', () => {
  it('parses, coerces and defaults the variables the schema names, and ignores the rest', () => {
    const config = loadConfig(schema, { env: { ...valid, PORT: '8080', PATH: '/usr/bin' } });

    expect(config).toEqual({ ...valid, PORT: 8080, LOG_LEVEL: 'info' });
    expect(Object.keys(config).sort()).toEqual(['APP_NAME', 'DATABASE_URL', 'LOG_LEVEL', 'PORT']);
  });

  it('returns a frozen object', () => {
    const config = loadConfig(schema, { env: valid });

    expect(Object.isFrozen(config)).toBe(true);
  });

  it('reads process.env when no env is given', () => {
    vi.stubEnv('DATABASE_URL', valid.DATABASE_URL);
    vi.stubEnv('APP_NAME', valid.APP_NAME);
    vi.stubEnv('PORT', '9000');

    expect(loadConfig(schema).PORT).toBe(9000);
  });

  it('treats an empty variable as unset, so its default applies', () => {
    const config = loadConfig(schema, { env: { ...valid, PORT: '', LOG_LEVEL: '' } });

    expect(config).toMatchObject({ PORT: 3000, LOG_LEVEL: 'info' });
  });

  it('reports an empty variable that has no default as missing', () => {
    const error = configErrorOf(() => loadConfig(schema, { env: { ...valid, DATABASE_URL: '' } }));

    expect(error.issues).toEqual([{ variable: 'DATABASE_URL', message: 'is missing' }]);
  });

  it('leaves an optional variable out of the result when it is unset', () => {
    const optional = z.object({ RELEASE: z.string().optional() });

    expect(Object.keys(loadConfig(optional, { env: {} }))).toEqual([]);
  });

  it('reports every problem at once, naming missing variables as missing', () => {
    const error = configErrorOf(() => loadConfig(schema, { env: { PORT: 'eighty' } }));

    expect(error.issues.map((issue) => issue.variable)).toEqual([
      'PORT',
      'DATABASE_URL',
      'APP_NAME',
    ]);
    expect(error.issues[0]?.message).not.toBe('is missing');
    expect(error.issues[1]?.message).toBe('is missing');
    expect(error.message.split('\n')[0]).toBe('Invalid configuration:');
    expect(error.message).toContain('- DATABASE_URL: is missing');
  });

  it('says that a required variable is missing, whatever its type', () => {
    const typed = z.object({
      MODE: z.enum(['fast', 'safe']),
      REGION: z.literal('eu'),
      TIER: z.union([z.literal('free'), z.literal('paid')]),
      WORKERS: z.coerce.number().int(),
      VERBOSE: z.stringbool(),
    });

    const error = configErrorOf(() => loadConfig(typed, { env: {} }));

    expect(error.issues).toEqual(
      ['MODE', 'REGION', 'TIER', 'WORKERS', 'VERBOSE'].map((variable) => ({
        variable,
        message: 'is missing',
      }))
    );
  });

  it('names an object-level failure as the config itself', () => {
    const paired = z
      .object({ TLS_CERT: z.string().optional(), TLS_KEY: z.string().optional() })
      .refine((value) => (value.TLS_CERT === undefined) === (value.TLS_KEY === undefined), {
        message: 'set TLS_CERT and TLS_KEY together',
      });

    const error = configErrorOf(() => loadConfig(paired, { env: { TLS_CERT: 'cert' } }));

    expect(error.issues).toEqual([
      { variable: '(config)', message: 'set TLS_CERT and TLS_KEY together' },
    ]);
  });

  it('keeps the message of a rule that points at an unset variable', () => {
    const paired = z
      .object({ TLS_CERT: z.string().optional(), TLS_KEY: z.string().optional() })
      .refine((value) => (value.TLS_CERT === undefined) === (value.TLS_KEY === undefined), {
        message: 'is needed when TLS_CERT is set',
        path: ['TLS_KEY'],
      });

    const error = configErrorOf(() => loadConfig(paired, { env: { TLS_CERT: 'cert' } }));

    expect(error.issues).toEqual([
      { variable: 'TLS_KEY', message: 'is needed when TLS_CERT is set' },
    ]);
  });

  it('names a problem inside a structured value by its path', () => {
    const structured = z.object({
      LIMITS: z
        .string()
        .transform((text) => JSON.parse(text) as unknown)
        .pipe(z.object({ perMinute: z.number() })),
    });

    const error = configErrorOf(() => loadConfig(structured, { env: { LIMITS: '{}' } }));

    expect(error.issues).toEqual([
      { variable: 'LIMITS.perMinute', message: expect.stringContaining('expected number') },
    ]);
  });

  it('never puts a value in the error', () => {
    const error = configErrorOf(() =>
      loadConfig(schema, {
        env: { DATABASE_URL: 'not a url', APP_NAME: 'zq', LOG_LEVEL: 'loud', PORT: 'eighty' },
      })
    );

    expect(error.issues.map((issue) => issue.variable).sort()).toEqual([
      'APP_NAME',
      'DATABASE_URL',
      'LOG_LEVEL',
      'PORT',
    ]);
    for (const value of ['not a url', 'zq', 'loud', 'eighty']) {
      expect(error.message).not.toContain(value);
      expect(JSON.stringify(error.issues)).not.toContain(value);
    }
  });

  it('is a ConfigError with its name set', () => {
    const error = configErrorOf(() => loadConfig(schema, { env: {} }));

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ConfigError');
  });
});

describe('a process that loads its config at start', () => {
  const entry = new URL('./index.ts', import.meta.url).href;
  const zod = pathToFileURL(createRequire(import.meta.url).resolve('zod')).href;
  const app = `
    import { loadConfig } from ${JSON.stringify(entry)};
    import * as z from ${JSON.stringify(zod)};
    const config = loadConfig(
      z.object({ PORT: z.coerce.number().int().positive(), DATABASE_URL: z.url() })
    );
    process.stdout.write('listening on ' + config.PORT);
  `;

  function start(env: Record<string, string>) {
    return spawnSync(process.execPath, ['--input-type=module', '--eval', app], {
      env,
      encoding: 'utf8',
    });
  }

  it('starts when every value is right', () => {
    const outcome = start({ PORT: '8080', DATABASE_URL: valid.DATABASE_URL });

    expect(outcome.stderr).toBe('');
    expect(outcome.stdout).toBe('listening on 8080');
    expect(outcome.status).toBe(0);
  });

  it('stops with code 1 and names every problem, without a value', () => {
    const outcome = start({ PORT: 'eighty' });

    expect(outcome.status).toBe(1);
    expect(outcome.stdout).toBe('');
    expect(outcome.stderr).toContain('ConfigError: Invalid configuration:');
    expect(outcome.stderr).toContain('- DATABASE_URL: is missing');
    expect(outcome.stderr).toContain('- PORT: ');
    expect(outcome.stderr).not.toContain('eighty');
  });
});
