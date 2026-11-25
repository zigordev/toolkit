import { github, google } from 'better-auth/social-providers';
import { describe, expect, it } from 'vitest';
import { createBackgroundTasks } from './background.ts';
import { createAuthClient } from './client.ts';
import { accountExistsIdempotencyKey, tokenIdempotencyKey } from './emails.ts';
import { authEventHooks, callbackError, createMethodResolver, methodName } from './events.ts';
import { headersOf, userOf } from './fastify.ts';
import { withGoogleStandIn } from './google.ts';
import type { AuthTelemetry } from './telemetry.ts';

describe('background tasks', () => {
  it('settles after every task, including tasks started while settling and tasks that fail', async () => {
    const tasks = createBackgroundTasks();
    const done: string[] = [];

    tasks.run(
      new Promise<void>((resolve) =>
        setTimeout(() => {
          done.push('first');
          tasks.run(Promise.resolve().then(() => done.push('second')));
          resolve();
        }, 5)
      )
    );
    tasks.run(Promise.reject(new Error('ignored')));
    await tasks.settle();

    expect(done).toEqual(['first', 'second']);
  });

  it('settles at once when nothing is pending', async () => {
    await expect(createBackgroundTasks().settle()).resolves.toBeUndefined();
  });
});

describe('idempotency keys', () => {
  it('derives one key per link token and kind, in visible ASCII under 256 characters', () => {
    const key = tokenIdempotencyKey('verify-email', 'token-1');

    expect(key).toBe(tokenIdempotencyKey('verify-email', 'token-1'));
    expect(key).not.toBe(tokenIdempotencyKey('verify-email', 'token-2'));
    expect(key).not.toBe(tokenIdempotencyKey('reset-password', 'token-1'));
    expect(key).toMatch(/^[\x21-\x7e]{1,255}$/);
  });

  it('allows one account-exists email per user every 10 minutes', () => {
    const start = Date.UTC(2026, 10, 19, 12, 0, 0);

    expect(accountExistsIdempotencyKey('user-1', start)).toBe(
      accountExistsIdempotencyKey('user-1', start + 9 * 60_000)
    );
    expect(accountExistsIdempotencyKey('user-1', start)).not.toBe(
      accountExistsIdempotencyKey('user-1', start + 10 * 60_000)
    );
    expect(accountExistsIdempotencyKey('user-1', start)).not.toBe(
      accountExistsIdempotencyKey('user-2', start)
    );
  });
});

describe('method names', () => {
  const methodOf = createMethodResolver(['email', 'google']);

  it('names the method from the endpoint and keeps the values bounded', () => {
    expect(methodOf({ path: '/sign-up/email' })).toBe('email');
    expect(methodOf({ path: '/verify-email' })).toBe('email');
    expect(methodOf({ path: '/callback/:id', params: { id: 'google' } })).toBe('google');
    expect(methodOf({ path: '/callback/:id', params: { id: 'evil' } })).toBe('other');
    expect(methodOf({ path: '/sign-in/social', body: { provider: 'google' } })).toBe('google');
    expect(methodOf({ path: '/sign-in/social', body: null })).toBe('other');
    expect(methodOf({ path: '/update-user' })).toBe('other');
    expect(methodOf({})).toBe('other');
    expect(methodOf(null)).toBe('other');
    expect(createMethodResolver(['google'])({ path: '/sign-in/email' })).toBe('other');
  });

  it('calls the password credential email', () => {
    expect(methodName('credential')).toBe('email');
    expect(methodName('google')).toBe('google');
  });

  it('does not report a link when the hook runs outside an endpoint', async () => {
    const linked: string[] = [];
    const ignore = () => undefined;
    const telemetry: AuthTelemetry = {
      signedUp: ignore,
      signedIn: ignore,
      signInFailed: ignore,
      signedOut: ignore,
      emailVerified: ignore,
      passwordReset: ignore,
      accountLinked: (method) => {
        linked.push(method);
      },
      accountDeleted: ignore,
      passkeyAdded: ignore,
      passkeyRemoved: ignore,
      twoFactorEnabled: ignore,
      twoFactorDisabled: ignore,
      accountDeletionFailed: ignore,
      emailSent: ignore,
      emailFailed: ignore,
      rateLimited: ignore,
    };
    const { databaseHooks } = authEventHooks({
      telemetry,
      methods: ['email'],
      baseUrl: 'http://localhost:3000',
      cookiePrefix: 'toolkit',
    });

    await databaseHooks.account.create.after({ userId: 'user-1', providerId: 'google' }, null);

    expect(linked).toEqual([]);
  });
});

describe('createAuthClient', () => {
  it('builds a Better Auth client on /api/auth, on an explicit origin when given one', () => {
    const relative = createAuthClient();
    const absolute = createAuthClient({ baseURL: 'https://gpool.example.com' });

    expect(typeof relative.signIn.email).toBe('function');
    expect(typeof relative.signIn.social).toBe('function');
    expect(typeof relative.signUp.email).toBe('function');
    expect(typeof absolute.signOut).toBe('function');
    expect(typeof absolute.useSession).toBe('function');
  });
});

describe('callbackError', () => {
  it('reads the error a provider callback redirected with', () => {
    const base = 'http://localhost:3000';

    expect(callbackError('/api/auth/error?error=state_mismatch', base)).toBe('state_mismatch');
    expect(callbackError('/dashboard', base)).toBeNull();
    expect(callbackError(null, base)).toBeNull();
    expect(callbackError(undefined, base)).toBeNull();
  });
});

describe('Fastify helpers', () => {
  it('copies repeated and single request headers, and skips missing ones', () => {
    const headers = headersOf({ 'x-tag': ['a', 'b'], cookie: 'c=1', authorization: undefined });

    expect(headers.get('x-tag')).toBe('a, b');
    expect(headers.get('cookie')).toBe('c=1');
    expect(headers.has('authorization')).toBe(false);
  });

  it('refuses userOf on a request that nobody signed in to', () => {
    expect(() => userOf({ user: null })).toThrow(/signed-in request/);
  });
});

describe('withGoogleStandIn', () => {
  const settings = { url: 'http://127.0.0.1:4010', clientId: 'id', clientSecret: 'secret' };

  it('points only the Google provider at the stand-in', async () => {
    const providers = [
      google({ clientId: 'id', clientSecret: 'secret' }),
      github({ clientId: 'gh', clientSecret: 'gh-secret' }),
    ];

    const [standIn, other] = withGoogleStandIn(providers, settings);
    const url = await standIn?.createAuthorizationURL({
      state: 'state',
      codeVerifier: 'v'.repeat(43),
      redirectURI: 'http://localhost:3000/api/auth/callback/google',
    });

    expect(other).toBe(providers[1]);
    expect(url?.origin).toBe('http://127.0.0.1:4010');
    expect(url?.pathname).toBe('/o/oauth2/v2/auth');
    expect(url?.searchParams.get('client_id')).toBe('id');
  });
});
