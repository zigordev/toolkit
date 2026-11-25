import { createLogger } from '@zigordev/otel';
import { useTestDatabase } from '@zigordev/test/postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import {
  Browser,
  cookieAttributes,
  type Harness,
  metricPoints,
  metricValue,
  secret,
  startHarness,
  strongPassword,
} from '../test/harness.ts';
import { createAuth } from './index.ts';

const database = useTestDatabase();
const harnesses: Harness[] = [];

async function harness(options: Omit<Parameters<typeof startHarness>[0], 'databaseUrl'>) {
  const started = await startHarness({ databaseUrl: database.url, ...options });
  harnesses.push(started);
  return started;
}

afterAll(async () => {
  for (const started of harnesses) {
    await started.close();
  }
});

function unusedOptions() {
  return {
    config: { AUTH_SECRET: secret, AUTH_URL: 'http://localhost:3000' },
    db: drizzle(new pg.Pool({ connectionString: 'postgres://unused@127.0.0.1:1/unused' })),
    logger: createLogger({ service: 'toolkit-auth-test', destination: { write: () => undefined } }),
    sendEmail: async () => undefined,
  };
}

describe('createAuth', () => {
  it('refuses an app name that cannot prefix a cookie, and an empty list of methods', () => {
    expect(() =>
      createAuth({ ...unusedOptions(), appName: 'GPool App', methods: ['email'] })
    ).toThrow(/appName/);
    expect(() => createAuth({ ...unusedOptions(), appName: 'gpool', methods: [] })).toThrow(
      /at least one sign-in method/
    );
  });

  it('refuses passkeys as the only method, because they cannot create accounts', () => {
    expect(() =>
      createAuth({ ...unusedOptions(), appName: 'gpool', methods: ['passkey'] })
    ).toThrow(/also needs email or google/);
  });

  it('refuses Google sign-in without its credentials', () => {
    expect(() => createAuth({ ...unusedOptions(), appName: 'gpool', methods: ['google'] })).toThrow(
      /AUTH_GOOGLE_CLIENT_ID/
    );
    expect(() =>
      createAuth({
        ...unusedOptions(),
        config: { ...unusedOptions().config, AUTH_GOOGLE_CLIENT_ID: 'id' },
        appName: 'gpool',
        methods: ['google'],
      })
    ).toThrow(/AUTH_GOOGLE_CLIENT_SECRET/);
  });

  it('uses __Secure- cookies with the Secure attribute on an https origin', async () => {
    const origin = 'https://gpool.example.com';
    const started = await harness({ config: { AUTH_URL: origin } });
    const browser = new Browser(started.app);
    await browser.post(
      '/api/auth/sign-up/email',
      { email: 'secure@example.com', password: strongPassword, name: 'Secure' },
      { origin }
    );
    await started.auth.settle();
    const message = started.outbox.at(-1);
    if (message?.kind !== 'verify-email') {
      throw new Error('no verification email');
    }
    expect(message.url.startsWith(`${origin}/api/auth/verify-email?`)).toBe(true);

    const verified = await browser.visit(message.url);

    const cookie = cookieAttributes(verified, '__Secure-toolkit.session_token') ?? '';
    expect(cookie).toMatch(/; Secure/i);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it('keeps serving when the email sender fails, and logs and counts the failure', async () => {
    const started = await harness({
      sendEmail: async () => {
        throw new Error('notifications refused failing@example.com');
      },
    });

    const response = await new Browser(started.app).post('/api/auth/sign-up/email', {
      email: 'failing@example.com',
      password: strongPassword,
      name: 'Failing',
    });
    await started.auth.settle();

    expect(response.statusCode).toBe(200);
    expect(started.events('auth.email_failed')).toEqual([
      expect.objectContaining({
        level: 'error',
        kind: 'verify-email',
        error: expect.objectContaining({ message: 'notifications refused [email]' }),
      }),
    ]);
    expect(
      await metricValue(started.reader, 'auth.email.sends', {
        kind: 'verify-email',
        outcome: 'failed',
      })
    ).toBe(1);
  });

  it('turns email and password off for a Google-only app, keeping only deletion emails', async () => {
    const started = await harness({
      methods: ['google'],
      config: { AUTH_GOOGLE_CLIENT_ID: 'id', AUTH_GOOGLE_CLIENT_SECRET: 'secret' },
    });

    const response = await new Browser(started.app).post('/api/auth/sign-up/email', {
      email: 'nope@example.com',
      password: strongPassword,
      name: 'Nope',
    });

    expect(response.statusCode).toBe(400);
    expect(started.events('auth.google_stand_in_enabled')).toEqual([]);
    expect(await metricPoints(started.reader, 'auth.email.sends')).toEqual([
      { attributes: { kind: 'delete-account', outcome: 'sent' }, value: 0 },
      { attributes: { kind: 'delete-account', outcome: 'failed' }, value: 0 },
    ]);
    expect(await metricPoints(started.reader, 'auth.user.sign_ins')).toEqual([
      { attributes: { method: 'google', outcome: 'success' }, value: 0 },
      { attributes: { method: 'google', outcome: 'failure' }, value: 0 },
    ]);
  });

  it('starts every counter at zero for the methods it knows', async () => {
    const started = await harness({
      methods: ['email', 'google'],
      config: { AUTH_GOOGLE_CLIENT_ID: 'id', AUTH_GOOGLE_CLIENT_SECRET: 'secret' },
    });

    expect(await metricPoints(started.reader, 'auth.user.sign_ups')).toEqual([
      { attributes: { method: 'email' }, value: 0 },
      { attributes: { method: 'google' }, value: 0 },
    ]);
    expect((await metricPoints(started.reader, 'auth.email.sends')).length).toBe(8);
  });
});
