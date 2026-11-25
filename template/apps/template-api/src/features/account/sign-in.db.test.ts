import { randomInt, randomUUID } from 'node:crypto';
import {
  createSoftwarePasskey,
  type GoogleStandIn,
  type PasskeyCreationOptions,
  type PasskeyRequestOptions,
  startGoogleStandIn,
  totpCode,
} from '@zigordev/auth/testing';
import { createLogger } from '@zigordev/otel';
import { captureLogs, expectProblem, useApp } from '@zigordev/test/app';
import { useTestDatabase } from '@zigordev/test/postgres';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.ts';
import { readConfig } from '../../config.ts';
import { hashKey } from '../../plugins/api-keys.ts';
import { type HeldEmail, holdEmails } from '../../plugins/sign-in.ts';

const appUrl = 'http://template.localhost';
const password = 'correct horse battery staple';
const reader = randomUUID();
const database = useTestDatabase();
const logs = captureLogs();
const logger = createLogger({ service: 'template-api', destination: logs });
const held = holdEmails('Template', logger);
let google: GoogleStandIn;

beforeAll(async () => {
  google = await startGoogleStandIn();
});

afterAll(async () => {
  await google.close();
});

const server = useApp(() =>
  buildApp({
    config: readConfig({
      OTEL_SERVICE_NAME: 'template-api',
      DATABASE_URL: database.url,
      API_KEYS: JSON.stringify([
        { name: 'reader', sha256: hashKey(reader), scopes: ['notes:read'] },
      ]),
      AUTH_SECRET: 'a-test-secret-that-is-long-enough-for-better-auth',
      AUTH_URL: appUrl,
      AUTH_EMAIL_HOLD: 'true',
      AUTH_GOOGLE_CLIENT_ID: google.clientId,
      AUTH_GOOGLE_CLIENT_SECRET: google.clientSecret,
      AUTH_GOOGLE_STAND_IN_URL: google.url,
    }),
    logger,
    heldEmails: held,
  })
);

class Browser {
  private readonly jar = new Map<string, string>();
  private readonly ip = `10.1.${randomInt(256)}.${randomInt(1, 255)}`;

  private headers(): Record<string, string> {
    const cookie = [...this.jar].map(([name, value]) => `${name}=${value}`).join('; ');
    return { origin: appUrl, 'x-forwarded-for': this.ip, ...(cookie === '' ? {} : { cookie }) };
  }

  private keep(response: LightMyRequestResponse): LightMyRequestResponse {
    const header = response.headers['set-cookie'];
    const cookies = header === undefined ? [] : Array.isArray(header) ? header : [header];
    for (const cookie of cookies) {
      const [pair = ''] = cookie.split(';');
      const name = pair.slice(0, pair.indexOf('='));
      const value = pair.slice(pair.indexOf('=') + 1);
      if (value === '' || /max-age=0/i.test(cookie)) {
        this.jar.delete(name);
      } else {
        this.jar.set(name, value);
      }
    }
    return response;
  }

  async get(url: string): Promise<LightMyRequestResponse> {
    const target = new URL(url, appUrl);
    return this.keep(
      await server.app.inject({
        method: 'GET',
        url: `${target.pathname}${target.search}`,
        headers: this.headers(),
      })
    );
  }

  async post(url: string, body: unknown): Promise<LightMyRequestResponse> {
    return this.keep(
      await server.app.inject({
        method: 'POST',
        url,
        headers: { ...this.headers(), 'content-type': 'application/json' },
        payload: JSON.stringify(body),
      })
    );
  }
}

async function heldFor(kind: HeldEmail['message']['kind'], to: string): Promise<HeldEmail> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const found = held.emails.findLast(
      (candidate) => candidate.message.kind === kind && candidate.message.to === to
    );
    if (found !== undefined) {
      return found;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`no ${kind} email was held for ${to}`);
}

function linkOf(email: HeldEmail): string {
  if (email.message.kind === 'account-exists') {
    throw new Error('the notice of a second sign-up carries no link');
  }
  return email.message.url;
}

async function signUp(address: string): Promise<Browser> {
  const browser = new Browser();
  const response = await browser.post('/api/auth/sign-up/email', {
    email: address,
    password,
    name: 'Ada Lovelace',
  });
  expect(response.statusCode).toBe(200);
  await browser.get(linkOf(await heldFor('verify-email', address)));
  return browser;
}

describe('sign-in with email and a password', () => {
  it('holds the verification email, and its link signs the person in', async () => {
    const browser = await signUp('ada@example.com');

    const me = await browser.get('/api/v1/me');

    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      emailVerified: true,
    });
    const email = await heldFor('verify-email', 'ada@example.com');
    expect(email.email.subject).toBe('Confirm your email address for Template');
  });

  it('signs in with the password once the address is verified', async () => {
    const browser = new Browser();

    const response = await browser.post('/api/auth/sign-in/email', {
      email: 'ada@example.com',
      password,
    });

    expect(response.statusCode).toBe(200);
    expect((await browser.get('/api/v1/me')).statusCode).toBe(200);
  });

  it('answers 401 to nobody and 403 to an API key on the account route', async () => {
    expectProblem(await new Browser().get('/api/v1/me'), {
      status: 401,
      code: 'auth.unauthenticated',
    });
    const response = await server.app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${reader}` },
    });
    expectProblem(response, { status: 403, code: 'auth.forbidden' });
  });

  it('sets a new password through the held reset email', async () => {
    await signUp('grace@example.com');
    const visitor = new Browser();
    await visitor.post('/api/auth/request-password-reset', {
      email: 'grace@example.com',
      redirectTo: '/reset-password',
    });
    const landing = await visitor.get(linkOf(await heldFor('reset-password', 'grace@example.com')));
    const token = new URL(String(landing.headers.location)).searchParams.get('token');

    const reset = await visitor.post('/api/auth/reset-password', {
      newPassword: 'a brand new passphrase for grace',
      token,
    });

    expect(reset.statusCode).toBe(200);
    const fresh = await new Browser().post('/api/auth/sign-in/email', {
      email: 'grace@example.com',
      password: 'a brand new passphrase for grace',
    });
    expect(fresh.statusCode).toBe(200);
  });

  it('tells the owner of an address when someone signs up with it again', async () => {
    await signUp('mary@example.com');

    await new Browser().post('/api/auth/sign-up/email', {
      email: 'mary@example.com',
      password,
      name: 'Someone Else',
    });

    const notice = await heldFor('account-exists', 'mary@example.com');
    expect(notice.email.subject).toBe('Someone tried to sign up to Template with your address');
  });
});

describe('sign-in with Google', () => {
  it('signs in through the stand-in and creates the account with a verified address', async () => {
    google.signInAs({
      sub: 'google-katherine',
      email: 'katherine@example.com',
      name: 'Katherine Johnson',
    });
    const browser = new Browser();
    const start = await browser.post('/api/auth/sign-in/social', {
      provider: 'google',
      callbackURL: '/',
    });
    const atGoogle = await fetch((start.json() as { url: string }).url, { redirect: 'manual' });

    await browser.get(atGoogle.headers.get('location') ?? '');

    const me = await browser.get('/api/v1/me');
    expect(me.json()).toMatchObject({ email: 'katherine@example.com', emailVerified: true });
  });
});

describe('passkeys', () => {
  it('lets a signed-in person add a passkey, and then sign in with it', async () => {
    const owner = await signUp('hedy@example.com');
    const passkey = createSoftwarePasskey();
    const creation = await owner.get('/api/auth/passkey/generate-register-options');
    const added = await owner.post('/api/auth/passkey/verify-registration', {
      response: passkey.register(creation.json() as PasskeyCreationOptions, appUrl),
      name: 'Laptop',
    });
    expect(added.statusCode).toBe(200);

    const browser = new Browser();
    const options = await browser.get('/api/auth/passkey/generate-authenticate-options');
    const signedIn = await browser.post('/api/auth/passkey/verify-authentication', {
      response: passkey.assert(options.json() as PasskeyRequestOptions, appUrl),
    });

    expect(signedIn.statusCode).toBe(200);
    expect((await browser.get('/api/v1/me')).json()).toMatchObject({ email: 'hedy@example.com' });
  });
});

describe('two-factor', () => {
  it('asks for the authenticator code after the password, once two-factor is on', async () => {
    const owner = await signUp('margaret@example.com');
    const enable = await owner.post('/api/auth/two-factor/enable', { password });
    const { totpURI } = enable.json() as { totpURI: string };
    expect(
      (await owner.post('/api/auth/two-factor/verify-totp', { code: totpCode(totpURI) })).statusCode
    ).toBe(200);

    const browser = new Browser();
    const first = await browser.post('/api/auth/sign-in/email', {
      email: 'margaret@example.com',
      password,
    });
    expect(first.json()).toMatchObject({ twoFactorRedirect: true });
    expect((await browser.get('/api/v1/me')).statusCode).toBe(401);

    const second = await browser.post('/api/auth/two-factor/verify-totp', {
      code: totpCode(totpURI),
    });

    expect(second.statusCode).toBe(200);
    expect((await browser.get('/api/v1/me')).statusCode).toBe(200);
  });
});

describe('account deletion', () => {
  it('deletes the account through the held confirmation link, opened while signed in', async () => {
    const owner = await signUp('barbara@example.com');
    await owner.post('/api/auth/delete-user', {});
    const email = await heldFor('delete-account', 'barbara@example.com');

    await owner.get(linkOf(email));

    expect((await owner.get('/api/v1/me')).statusCode).toBe(401);
    const again = await new Browser().post('/api/auth/sign-in/email', {
      email: 'barbara@example.com',
      password,
    });
    expect(again.statusCode).toBe(401);
  });
});

describe('the held emails', () => {
  it('log only their kind, never the address or the link', () => {
    const lines = logs.lines.filter((line) => line.event === 'auth.email_held');

    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(Object.keys(line)).not.toContain('to');
      expect(JSON.stringify(line)).not.toMatch(/@example\.com|token=/);
    }
  });
});
