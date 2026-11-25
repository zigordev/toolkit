import { useTestDatabase } from '@zigordev/test/postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  appUrl,
  Browser,
  type Harness,
  metricValue,
  registerVerified,
  startHarness,
  strongPassword,
} from '../test/harness.ts';
import { type GoogleStandIn, startGoogleStandIn } from './testing.ts';

const database = useTestDatabase();
let standIn: GoogleStandIn;
let harness: Harness;

beforeAll(async () => {
  standIn = await startGoogleStandIn();
  harness = await startHarness({
    databaseUrl: database.url,
    methods: ['email', 'google'],
    config: {
      AUTH_GOOGLE_CLIENT_ID: standIn.clientId,
      AUTH_GOOGLE_CLIENT_SECRET: standIn.clientSecret,
      AUTH_GOOGLE_STAND_IN_URL: standIn.url,
    },
  });
});

afterAll(async () => {
  await harness.close();
  await standIn.close();
});

async function startGoogle(browser: Browser, callbackURL = '/dashboard') {
  const start = await browser.post('/api/auth/sign-in/social', { provider: 'google', callbackURL });
  const { url } = start.json() as { url: string };
  const atGoogle = await fetch(url, { redirect: 'manual' });
  return { start, authorization: new URL(url), back: atGoogle.headers.get('location') ?? '' };
}

async function signInWithGoogle(browser: Browser, callbackURL = '/dashboard') {
  const { back } = await startGoogle(browser, callbackURL);
  const callback = await browser.visit(back);
  await harness.auth.settle();
  return callback;
}

async function userByEmail(email: string) {
  const [user] = await harness.query<{
    id: string;
    email_verified: boolean;
    name: string;
    image: string;
  }>('select id, email_verified, name, image from users where email = $1', [email]);
  return user;
}

async function providersOf(userId: string): Promise<string[]> {
  const rows = await harness.query<{ provider_id: string }>(
    'select provider_id from accounts where user_id = $1 order by provider_id',
    [userId]
  );
  return rows.map((row) => row.provider_id);
}

describe('Google sign-in against the stand-in', () => {
  it('says in the logs that Google points at a stand-in', () => {
    expect(harness.events('auth.google_stand_in_enabled')).toEqual([
      expect.objectContaining({ level: 'warn', standInUrl: standIn.url }),
    ]);
  });

  it('starts the flow with PKCE, a state and the app callback', async () => {
    const { start, authorization } = await startGoogle(new Browser(harness.app));

    expect(start.statusCode).toBe(200);
    expect(start.json()).toMatchObject({ redirect: true });
    expect(authorization.origin).toBe(standIn.url);
    expect(authorization.pathname).toBe('/o/oauth2/v2/auth');
    const params = authorization.searchParams;
    expect(params.get('client_id')).toBe(standIn.clientId);
    expect(params.get('redirect_uri')).toBe(`${appUrl}/api/auth/callback/google`);
    expect(params.get('response_type')).toBe('code');
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(params.get('state')).toBeTruthy();
    expect(params.get('prompt')).toBe('select_account');
    expect(params.get('scope')?.split(' ')).toEqual(
      expect.arrayContaining(['openid', 'email', 'profile'])
    );
  });

  it('creates a verified account for a new Google user and signs them in', async () => {
    standIn.signInAs({
      sub: 'google-grace',
      email: 'grace@example.com',
      name: 'Grace Hopper',
      picture: 'https://example.com/grace.png',
    });
    const browser = new Browser(harness.app);

    const callback = await signInWithGoogle(browser);

    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toBe('/dashboard');
    expect(browser.cookie('toolkit.session_token')).toBeDefined();
    const user = await userByEmail('grace@example.com');
    expect(user).toMatchObject({
      email_verified: true,
      name: 'Grace Hopper',
      image: 'https://example.com/grace.png',
    });
    expect(await providersOf(user?.id ?? '')).toEqual(['google']);
    expect((await browser.get('/api/v1/me')).json()).toMatchObject({ id: user?.id });
    expect(harness.events('auth.signed_up').at(-1)).toMatchObject({
      method: 'google',
      userId: user?.id,
    });
    expect(harness.events('auth.signed_in').at(-1)).toMatchObject({
      method: 'google',
      userId: user?.id,
    });
    expect(await metricValue(harness.reader, 'auth.user.sign_ups', { method: 'google' })).toBe(1);
  });

  it('signs a returning Google user into the same account', async () => {
    standIn.signInAs({ sub: 'google-grace', email: 'grace@example.com', name: 'Grace Hopper' });
    const users = await harness.query('select id from users');

    const callback = await signInWithGoogle(new Browser(harness.app));

    expect(callback.statusCode).toBe(302);
    expect(await harness.query('select id from users')).toEqual(users);
    expect(
      await metricValue(harness.reader, 'auth.user.sign_ins', {
        method: 'google',
        outcome: 'success',
      })
    ).toBe(2);
  });

  it('links Google to a verified password account with the same email', async () => {
    const userId = await registerVerified(harness, new Browser(harness.app), 'ada@example.com');
    standIn.signInAs({ sub: 'google-ada', email: 'ada@example.com', name: 'Ada Lovelace' });
    const browser = new Browser(harness.app);

    const callback = await signInWithGoogle(browser);

    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toBe('/dashboard');
    expect(await providersOf(userId)).toEqual(['credential', 'google']);
    expect((await browser.get('/api/v1/me')).json()).toMatchObject({ id: userId });
    expect(harness.events('auth.account_linked')).toEqual([
      expect.objectContaining({ method: 'google', userId }),
    ]);
  });

  it('refuses to link Google to a password account whose email is not verified', async () => {
    const squatter = new Browser(harness.app);
    await squatter.post('/api/auth/sign-up/email', {
      email: 'victim@example.com',
      password: strongPassword,
      name: 'Squatter',
    });
    await harness.auth.settle();
    standIn.signInAs({ sub: 'google-victim', email: 'victim@example.com', name: 'Real Owner' });
    const owner = new Browser(harness.app);

    const callback = await signInWithGoogle(owner);

    expect(callback.statusCode).toBe(302);
    expect(new URL(callback.headers.location ?? '', appUrl).searchParams.get('error')).toBe(
      'account_not_linked'
    );
    expect(owner.cookie('toolkit.session_token')).toBeUndefined();
    const user = await userByEmail('victim@example.com');
    expect(await providersOf(user?.id ?? '')).toEqual(['credential']);
    expect(harness.events('auth.sign_in_failed').at(-1)).toMatchObject({
      method: 'google',
      reason: 'account_not_linked',
    });
  });

  it('adds a password to a Google-only account through a password reset', async () => {
    const user = await userByEmail('grace@example.com');
    const browser = new Browser(harness.app);
    await browser.post('/api/auth/request-password-reset', {
      email: 'grace@example.com',
      redirectTo: '/reset-password',
    });
    await harness.auth.settle();
    const message = harness.outbox.at(-1);
    if (message?.kind !== 'reset-password') {
      throw new Error('no reset email');
    }
    const token = new URL(message.url).pathname.split('/').at(-1);

    const reset = await browser.post('/api/auth/reset-password', {
      newPassword: 'grace now has a password too',
      token,
    });
    const signIn = await browser.post('/api/auth/sign-in/email', {
      email: 'grace@example.com',
      password: 'grace now has a password too',
    });

    expect(reset.statusCode).toBe(200);
    expect(signIn.statusCode).toBe(200);
    expect(await providersOf(user?.id ?? '')).toEqual(['credential', 'google']);
    expect(harness.events('auth.account_linked').at(-1)).toMatchObject({
      method: 'email',
      userId: user?.id,
    });
  });

  it('counts a sign-in the user cancels at Google as a failure', async () => {
    standIn.denyNext();
    const browser = new Browser(harness.app);

    const callback = await signInWithGoogle(browser);

    expect(callback.statusCode).toBe(302);
    expect(new URL(callback.headers.location ?? '', appUrl).searchParams.get('error')).toBe(
      'access_denied'
    );
    expect(browser.cookie('toolkit.session_token')).toBeUndefined();
    expect(harness.events('auth.sign_in_failed').at(-1)).toMatchObject({
      method: 'google',
      reason: 'access_denied',
    });
  });

  it('refuses a callback that another browser started', async () => {
    standIn.signInAs({ sub: 'google-grace', email: 'grace@example.com', name: 'Grace Hopper' });
    const { back } = await startGoogle(new Browser(harness.app));
    const attacker = new Browser(harness.app);

    const callback = await attacker.visit(back);

    expect(callback.statusCode).toBe(302);
    expect(new URL(callback.headers.location ?? '', appUrl).searchParams.get('error')).toBeTruthy();
    expect(attacker.cookie('toolkit.session_token')).toBeUndefined();
  });
});
