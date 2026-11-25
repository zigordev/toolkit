import { useTestDatabase } from '@zigordev/test/postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  appUrl,
  Browser,
  type Harness,
  pathOf,
  registerVerified,
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

const newPassword = 'a brand new passphrase for ada';

async function requestReset(browser: Browser, email: string) {
  const response = await browser.post('/api/auth/request-password-reset', {
    email,
    redirectTo: '/reset-password',
  });
  await harness.auth.settle();
  return response;
}

describe('password reset', () => {
  it('answers the same way for an unknown email and sends nothing', async () => {
    const browser = new Browser(harness.app);

    const response = await requestReset(browser, 'nobody@example.com');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: true,
      message: 'If this email exists in our system, check your email for the reset link',
    });
    expect(harness.outbox).toEqual([]);
  });

  it('sends a one-hour link, stores only a hash of it, resets the password and ends every session', async () => {
    const signedIn = new Browser(harness.app);
    const userId = await registerVerified(harness, signedIn, 'ada@example.com');
    expect((await signedIn.get('/api/v1/me')).statusCode).toBe(200);
    const visitor = new Browser(harness.app);

    const requested = await requestReset(visitor, 'ada@example.com');

    expect(requested.statusCode).toBe(200);
    const message = harness.outbox.at(-1);
    if (message?.kind !== 'reset-password') {
      throw new Error('no reset email');
    }
    expect(message.to).toBe('ada@example.com');
    expect(message.idempotencyKey).toMatch(/^auth-reset-password-[0-9a-f]{64}$/);
    const token = new URL(message.url).pathname.split('/').at(-1) ?? '';
    const stored = await harness.query<{ identifier: string; expires_at: Date }>(
      "select identifier, expires_at from verifications where identifier not like 'email-verification%'"
    );
    expect(stored.some((row) => row.identifier.includes(token))).toBe(false);
    const minutesLeft = Math.max(
      ...stored.map((row) => (row.expires_at.getTime() - Date.now()) / 60_000)
    );
    expect(minutesLeft).toBeGreaterThan(58);
    expect(minutesLeft).toBeLessThanOrEqual(60);

    const landing = await visitor.visit(message.url);
    expect(landing.statusCode).toBe(302);
    expect(landing.headers.location).toBe(`${appUrl}/reset-password?token=${token}`);

    const reset = await visitor.post('/api/auth/reset-password', { newPassword, token });
    expect(reset.statusCode).toBe(200);
    expect((await signedIn.get('/api/v1/me')).statusCode).toBe(401);
    expect(harness.events('auth.password_reset')).toEqual([expect.objectContaining({ userId })]);

    const again = await visitor.post('/api/auth/reset-password', {
      newPassword: 'yet another passphrase',
      token,
    });
    expect(again.statusCode).toBe(400);
    expect(again.json()).toMatchObject({ code: 'INVALID_TOKEN' });
  });

  it('signs in with the new password and refuses the old one', async () => {
    const browser = new Browser(harness.app);

    const old = await browser.post('/api/auth/sign-in/email', {
      email: 'ada@example.com',
      password: strongPassword,
    });
    const fresh = await browser.post('/api/auth/sign-in/email', {
      email: 'ada@example.com',
      password: newPassword,
    });

    expect(old.statusCode).toBe(401);
    expect(fresh.statusCode).toBe(200);
  });

  it('sends an expired or unknown reset link back with an error', async () => {
    const browser = new Browser(harness.app);

    const response = await browser.get(
      pathOf('/api/auth/reset-password/not-a-real-token?callbackURL=%2Freset-password')
    );

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(`${appUrl}/reset-password?error=INVALID_TOKEN`);
  });
});
