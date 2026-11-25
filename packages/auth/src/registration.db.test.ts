import { useTestDatabase } from '@zigordev/test/postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  Browser,
  cookieAttributes,
  type Harness,
  metricValue,
  pathOf,
  startHarness,
  strongPassword,
} from '../test/harness.ts';

const database = useTestDatabase();
let harness: Harness;

beforeAll(async () => {
  harness = await startHarness({ databaseUrl: database.url });
});

afterAll(async () => {
  await harness.close();
});

async function signUp(browser: Browser, email: string, password = strongPassword) {
  const response = await browser.post('/api/auth/sign-up/email', {
    email,
    password,
    name: 'Ada Lovelace',
    callbackURL: '/welcome',
  });
  await harness.auth.settle();
  return response;
}

describe('registration with email and password', () => {
  it('creates an unverified user, sends a verification link and starts no session', async () => {
    const browser = new Browser(harness.app);

    const response = await signUp(browser, 'Ada@Example.com');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ token: null, user: { email: 'ada@example.com' } });
    expect(browser.cookie('toolkit.session_token')).toBeUndefined();
    const [user] = await harness.query<{ id: string; email_verified: boolean }>(
      'select id, email_verified from users where email = $1',
      ['ada@example.com']
    );
    expect(user?.email_verified).toBe(false);
    expect(user?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
    const message = harness.outbox.at(-1);
    expect(message).toMatchObject({
      kind: 'verify-email',
      to: 'ada@example.com',
      name: 'Ada Lovelace',
    });
    expect(message?.kind === 'verify-email' && message.url).toMatch(
      /^http:\/\/localhost:3000\/api\/auth\/verify-email\?token=.+&callbackURL=%2Fwelcome$/
    );
    expect(message?.idempotencyKey).toMatch(/^auth-verify-email-[0-9a-f]{64}$/);
    expect(message?.request).toBeInstanceOf(Request);
    expect(harness.events('auth.signed_up')).toEqual([
      expect.objectContaining({ level: 'info', method: 'email', userId: user?.id }),
    ]);
    expect(await metricValue(harness.reader, 'auth.user.sign_ups', { method: 'email' })).toBe(1);
    expect(
      await metricValue(harness.reader, 'auth.email.sends', {
        kind: 'verify-email',
        outcome: 'sent',
      })
    ).toBe(1);
  });

  it('refuses a password sign-in until the email is verified, and sends a fresh link', async () => {
    const browser = new Browser(harness.app);
    const sent = harness.outbox.length;

    const response = await browser.post('/api/auth/sign-in/email', {
      email: 'ada@example.com',
      password: strongPassword,
    });
    await harness.auth.settle();

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
    expect(harness.outbox.length).toBe(sent + 1);
    expect(harness.events('auth.sign_in_failed').at(-1)).toMatchObject({
      level: 'warn',
      method: 'email',
      reason: 'email_not_verified',
    });
  });

  it('verifies the email from the link, signs the user in and redirects to the callback', async () => {
    const browser = new Browser(harness.app);
    const message = harness.outbox.find((email) => email.kind === 'verify-email');
    if (message?.kind !== 'verify-email') {
      throw new Error('no verification email');
    }

    const response = await browser.visit(message.url);

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/welcome');
    expect(browser.cookie('toolkit.session_token')).toBeDefined();
    const me = await browser.get('/api/v1/me');
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ email: 'ada@example.com' });
    const [user] = await harness.query<{ id: string; email_verified: boolean }>(
      'select id, email_verified from users where email = $1',
      ['ada@example.com']
    );
    expect(user?.email_verified).toBe(true);
    expect(harness.events('auth.email_verified')).toEqual([
      expect.objectContaining({ userId: user?.id }),
    ]);
    expect(harness.events('auth.signed_in').at(-1)).toMatchObject({
      method: 'email',
      userId: user?.id,
    });
  });

  it('sets a host-only, HttpOnly, SameSite=Lax session cookie named after the app', async () => {
    const browser = new Browser(harness.app);

    const response = await browser.post('/api/auth/sign-in/email', {
      email: 'ada@example.com',
      password: strongPassword,
    });

    expect(response.statusCode).toBe(200);
    const cookie = cookieAttributes(response, 'toolkit.session_token') ?? '';
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=604800/);
    expect(cookie).not.toMatch(/Domain=/i);
    expect(harness.events('auth.signed_in').at(-1)).toMatchObject({ method: 'email' });
    expect(
      await metricValue(harness.reader, 'auth.user.sign_ins', {
        method: 'email',
        outcome: 'success',
      })
    ).toBeGreaterThanOrEqual(2);
  });

  it('answers a sign-up for an existing email as if it were new, and tells the owner', async () => {
    const browser = new Browser(harness.app);
    const users = await harness.query<{ count: string }>('select count(*) from users');

    const response = await signUp(browser, 'ada@example.com', 'another long passphrase here');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ token: null, user: { email: 'ada@example.com' } });
    expect(await harness.query('select count(*) from users')).toEqual(users);
    expect(harness.outbox.at(-1)).toMatchObject({ kind: 'account-exists', to: 'ada@example.com' });
    expect(harness.outbox.at(-1)?.idempotencyKey).toMatch(
      /^auth-account-exists-[0-9a-f-]{36}-\d+$/
    );
  });

  it('requires passwords of 15 to 128 characters', async () => {
    const browser = new Browser(harness.app);

    const short = await signUp(browser, 'grace@example.com', 'fourteen chars');
    const long = await signUp(browser, 'grace@example.com', 'x'.repeat(129));
    const fifteen = await signUp(browser, 'grace@example.com', 'fifteen chars!!');

    expect(short.statusCode).toBe(400);
    expect(short.json()).toMatchObject({ code: 'PASSWORD_TOO_SHORT' });
    expect(long.statusCode).toBe(400);
    expect(long.json()).toMatchObject({ code: 'PASSWORD_TOO_LONG' });
    expect(fifteen.statusCode).toBe(200);
  });

  it('refuses a wrong password and counts the failure', async () => {
    const browser = new Browser(harness.app);

    const response = await browser.post('/api/auth/sign-in/email', {
      email: 'ada@example.com',
      password: 'not the right passphrase',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'INVALID_EMAIL_OR_PASSWORD' });
    expect(harness.events('auth.sign_in_failed').at(-1)).toMatchObject({
      method: 'email',
      reason: 'invalid_email_or_password',
    });
    expect(
      await metricValue(harness.reader, 'auth.user.sign_ins', {
        method: 'email',
        outcome: 'failure',
      })
    ).toBeGreaterThanOrEqual(2);
  });

  it('never writes an email address into the logs', () => {
    const text = JSON.stringify(harness.logs);

    expect(text).not.toMatch(/ada@example\.com/i);
    expect(text).not.toMatch(/grace@example\.com/i);
    expect(pathOf('/x')).toBe('/x');
  });
});
