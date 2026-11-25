import { useTestDatabase } from '@zigordev/test/postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Browser, type Harness, startHarness } from '../test/harness.ts';
import { routeOf } from './create-auth.ts';

const database = useTestDatabase();
let harness: Harness;

beforeAll(async () => {
  harness = await startHarness({ databaseUrl: database.url });
});

afterAll(async () => {
  await harness.close();
});

const attempt = { email: 'nobody@example.com', password: 'not a real passphrase' };

describe('rate limiting', () => {
  it('allows three sign-in attempts per 10 seconds from one address, then answers 429', async () => {
    const browser = new Browser(harness.app);

    const statuses: number[] = [];
    for (let index = 0; index < 3; index += 1) {
      statuses.push((await browser.post('/api/auth/sign-in/email', attempt)).statusCode);
    }
    const limited = await browser.post('/api/auth/sign-in/email', attempt);

    expect(statuses).toEqual([401, 401, 401]);
    expect(limited.statusCode).toBe(429);
    expect(Number(limited.headers['x-retry-after'])).toBeGreaterThan(0);
    expect(harness.events('auth.rate_limited')).toEqual([
      expect.objectContaining({ level: 'warn', route: '/sign-in/email' }),
    ]);
  });

  it('keeps each client address in its own bucket, in the rate_limits table', async () => {
    const other = new Browser(harness.app);

    const response = await other.post('/api/auth/sign-in/email', attempt);

    expect(response.statusCode).toBe(401);
    const rows = await harness.query<{ key: string; count: number }>(
      'select key, count from rate_limits order by key'
    );
    expect(rows.map((row) => row.key)).toEqual(
      expect.arrayContaining([expect.stringContaining('/sign-in/email')])
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('allows three reset emails per minute from one address', async () => {
    const browser = new Browser(harness.app);
    const body = { email: 'nobody@example.com', redirectTo: '/reset-password' };

    for (let index = 0; index < 3; index += 1) {
      expect((await browser.post('/api/auth/request-password-reset', body)).statusCode).toBe(200);
    }

    expect((await browser.post('/api/auth/request-password-reset', body)).statusCode).toBe(429);
  });

  it('never limits reading the session', async () => {
    const browser = new Browser(harness.app);

    const statuses = new Set<number>();
    for (let index = 0; index < 105; index += 1) {
      statuses.add((await browser.get('/api/auth/get-session')).statusCode);
    }

    expect([...statuses]).toEqual([200]);
  });

  it('names a limited route without any token in it', () => {
    expect(routeOf('http://localhost:3000/api/auth/reset-password/AbCdEfGhIjKlMnOpQrStUvWx')).toBe(
      '/reset-password/:token'
    );
    expect(routeOf('http://localhost:3000/api/auth/callback/google?code=secret')).toBe(
      '/callback/google'
    );
    expect(routeOf('http://localhost:3000/api/auth')).toBe('/');
  });
});
