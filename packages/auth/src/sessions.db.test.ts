import { expectProblem } from '@zigordev/test/app';
import { useTestDatabase } from '@zigordev/test/postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appUrl, Browser, type Harness, registerVerified, startHarness } from '../test/harness.ts';

const database = useTestDatabase();
let harness: Harness;
let userId: string;
const browser = { current: undefined as Browser | undefined };

beforeAll(async () => {
  harness = await startHarness({ databaseUrl: database.url });
  browser.current = new Browser(harness.app);
  userId = await registerVerified(harness, browser.current, 'ada@example.com');
});

afterAll(async () => {
  await harness.close();
});

function signedIn(): Browser {
  if (browser.current === undefined) {
    throw new Error('not signed in');
  }
  return browser.current;
}

describe('sessions', () => {
  it('keeps each session in the database for 7 days, keyed by a UUID', async () => {
    const rows = await harness.query<{ id: string; user_id: string; expires_at: Date }>(
      'select id, user_id, expires_at from sessions'
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.user_id).toBe(userId);
    expect(rows[0]?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
    const days = ((rows[0]?.expires_at.getTime() ?? 0) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
  });

  it('lets a signed-in request through and puts the user and session on the request', async () => {
    const response = await signedIn().get('/api/v1/me');

    expect(response.statusCode).toBe(200);
    const [session] = await harness.query<{ id: string }>('select id from sessions');
    expect(response.json()).toEqual({
      id: userId,
      email: 'ada@example.com',
      sessionId: session?.id,
    });
  });

  it('answers the standard 401 problem when there is no session', async () => {
    const response = await new Browser(harness.app).get('/api/v1/me?view=full');

    expectProblem(response, { status: 401, code: 'auth.unauthenticated' });
  });

  it('answers 401 for a forged session cookie', async () => {
    const forged = new Browser(harness.app);
    forged.store(['toolkit.session_token=forged.value; Path=/']);

    expect((await forged.get('/api/v1/me')).statusCode).toBe(401);
  });

  it('refuses a cookie-carrying POST from another origin', async () => {
    const response = await signedIn().post(
      '/api/auth/sign-out',
      {},
      { origin: 'https://evil.example.net' }
    );

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'INVALID_ORIGIN' });
    expect((await signedIn().get('/api/v1/me')).statusCode).toBe(200);
  });

  it('refuses a callback URL on another origin', async () => {
    const response = await new Browser(harness.app).post('/api/auth/sign-in/email', {
      email: 'ada@example.com',
      password: 'correct horse battery staple',
      callbackURL: 'https://evil.example.net/steal',
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'INVALID_CALLBACK_URL' });
  });

  it('serves the session to the browser through the auth routes', async () => {
    const response = await signedIn().get('/api/auth/get-session');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ user: { id: userId, email: 'ada@example.com' } });
  });

  it('reads the session on the server without refreshing it', async () => {
    const headers = new Headers({ cookie: signedIn().cookieHeader(), origin: appUrl });

    const session = await harness.auth.getSession(headers);
    const nobody = await harness.auth.getSession(new Headers());

    expect(session?.user).toMatchObject({ id: userId, email: 'ada@example.com', image: null });
    expect(session?.session.userId).toBe(userId);
    expect(session?.session).not.toHaveProperty('token');
    expect(nobody).toBeNull();
  });

  it('renews a session used after a day, and sends the renewed cookie with the answer', async () => {
    await harness.query(
      "update sessions set expires_at = now() + interval '5 days', updated_at = now() - interval '2 days'"
    );

    const response = await signedIn().get('/api/v1/me');

    expect(response.statusCode).toBe(200);
    expect(String(response.headers['set-cookie'])).toMatch(
      /toolkit\.session_token=.*Max-Age=604800/
    );
    const [row] = await harness.query<{ expires_at: Date }>('select expires_at from sessions');
    expect(((row?.expires_at.getTime() ?? 0) - Date.now()) / 86_400_000).toBeGreaterThan(6.9);
  });

  it('accepts a POST without a body on the auth routes', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: { origin: appUrl, 'x-forwarded-for': '10.9.9.9' },
    });

    expect(response.statusCode).toBeLessThan(500);
  });

  it('signs out, clears the cookie and deletes the session', async () => {
    const response = await signedIn().post('/api/auth/sign-out', {});

    expect(response.statusCode).toBe(200);
    expect(signedIn().cookie('toolkit.session_token')).toBeUndefined();
    expect(await harness.query('select id from sessions')).toEqual([]);
    expect((await signedIn().get('/api/v1/me')).statusCode).toBe(401);
    expect(harness.events('auth.signed_out')).toEqual([expect.objectContaining({ userId })]);
  });

  it('rejects an expired session', async () => {
    const again = new Browser(harness.app);
    await again.post('/api/auth/sign-in/email', {
      email: 'ada@example.com',
      password: 'correct horse battery staple',
    });
    await harness.query("update sessions set expires_at = now() - interval '1 minute'");

    expect((await again.get('/api/v1/me')).statusCode).toBe(401);
  });
});
