import { randomInt, randomUUID } from 'node:crypto';
import {
  createSoftwarePasskey,
  type GoogleStandIn,
  type PasskeyCreationOptions,
  type PasskeyRequestOptions,
  startGoogleStandIn,
  totpCode,
} from '@zigordev/auth/testing';
import {
  addToOutbox,
  type Database,
  deadLetterTopicOf,
  defineConsumer,
  startEvents,
} from '@zigordev/events';
import { createTopics } from '@zigordev/events/testing';
import {
  type EmailRequestedEvent,
  emailFailed,
  emailRequested,
  emailSent,
} from '@zigordev/notifications-events';
import { createLogger, type Logger } from '@zigordev/otel';
import { captureLogs, expectProblem, type LogLine, useApp } from '@zigordev/test/app';
import { uniqueTopic, useKafka } from '@zigordev/test/kafka';
import { useTestDatabase } from '@zigordev/test/postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { LightMyRequestResponse } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.ts';
import { readConfig } from '../../config.ts';
import { hashKey } from '../../plugins/api-keys.ts';
import type { EmailTopics } from '../../plugins/emails.ts';

const appUrl = 'http://template.localhost';
const password = 'correct horse battery staple';
const reader = randomUUID();
const refused = '@refused.example.com';
const database = useTestDatabase();
const kafka = useKafka();
const logs = captureLogs();
const logger = createLogger({ service: 'template-api', destination: logs });
const topics: EmailTopics = {
  requests: uniqueTopic('notifications.requests.template-api'),
  outcomes: uniqueTopic('notifications.outcomes.template-api'),
  outcomesGroup: uniqueTopic('template-api.email-outcomes'),
};
let google: GoogleStandIn;
let pool: pg.Pool;
let notifications: NotificationsStandIn;

interface NotificationsStandIn {
  readonly requests: readonly EmailRequestedEvent[];
  stop(): Promise<void>;
}

async function answer(tx: Database, request: EmailRequestedEvent): Promise<void> {
  const at = new Date().toISOString();
  if (request.data.to.email.endsWith(refused)) {
    await addToOutbox(tx, {
      topic: topics.outcomes,
      event: emailFailed,
      data: { requestId: request.id, failedAt: at, attempts: 1, reason: 'rejected', smtpCode: 550 },
    });
    return;
  }
  await addToOutbox(tx, {
    topic: topics.outcomes,
    event: emailSent,
    data: { requestId: request.id, sentAt: at, attempts: 1 },
  });
}

function startNotificationsStandIn(db: Database, quiet: Logger): NotificationsStandIn {
  const requests: EmailRequestedEvent[] = [];
  const events = startEvents({
    connection: { clientId: 'notifications-api', ...kafka },
    db,
    logger: quiet,
    relay: false,
    consumers: [
      defineConsumer({
        group: uniqueTopic('notifications-api.requests'),
        topics: [topics.requests],
        events: [emailRequested],
        handle: async (request, { tx }) => {
          requests.push(request);
          await answer(tx, request);
        },
      }),
    ],
  });
  return { requests, stop: () => events.stop() };
}

beforeAll(async () => {
  google = await startGoogleStandIn();
  await createTopics({ clientId: 'template-api-test', ...kafka }, [
    topics.requests,
    topics.outcomes,
    deadLetterTopicOf(topics.requests),
    deadLetterTopicOf(topics.outcomes),
  ]);
  pool = new pg.Pool({ connectionString: database.url, max: 3 });
  notifications = startNotificationsStandIn(
    drizzle({ client: pool, casing: 'snake_case' }),
    createLogger({ service: 'notifications-api', destination: captureLogs() })
  );
});

afterAll(async () => {
  await notifications.stop();
  await pool.end();
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
      AUTH_GOOGLE_CLIENT_ID: google.clientId,
      AUTH_GOOGLE_CLIENT_SECRET: google.clientSecret,
      AUTH_GOOGLE_STAND_IN_URL: google.url,
      KAFKA_BROKERS: kafka.brokers.join(','),
      KAFKA_USERNAME: kafka.username,
      KAFKA_PASSWORD: kafka.password,
    }),
    logger,
    emails: { topics, relayInterval: 100 },
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
    return this.send('POST', url, body);
  }

  async patch(url: string, body: unknown): Promise<LightMyRequestResponse> {
    return this.send('PATCH', url, body);
  }

  async delete(url: string): Promise<LightMyRequestResponse> {
    return this.keep(await server.app.inject({ method: 'DELETE', url, headers: this.headers() }));
  }

  private async send(
    method: 'POST' | 'PATCH',
    url: string,
    body: unknown
  ): Promise<LightMyRequestResponse> {
    return this.keep(
      await server.app.inject({
        method,
        url,
        headers: { ...this.headers(), 'content-type': 'application/json' },
        payload: JSON.stringify(body),
      })
    );
  }
}

async function eventually<T>(what: string, find: () => T | undefined): Promise<T> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const found = find();
    if (found !== undefined) {
      return found;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`${what} did not come within 20 seconds`);
}

function requestFor(template: string, to: string): Promise<EmailRequestedEvent> {
  return eventually(`the ${template} request to ${to}`, () =>
    notifications.requests.findLast(
      (request) => request.data.tags.template === template && request.data.to.email === to
    )
  );
}

function logOf(event: string, requestId: string): Promise<LogLine> {
  return eventually(`the log line ${event} of ${requestId}`, () =>
    logs.find(event).find((line) => line.requestId === requestId)
  );
}

function linkOf(request: EmailRequestedEvent): string {
  const link = request.data.text?.match(/https?:\/\/\S+/)?.[0];
  if (link === undefined) {
    throw new Error(`the ${request.data.tags.template} email carries no link`);
  }
  return link;
}

async function signUp(address: string): Promise<Browser> {
  const browser = new Browser();
  const response = await browser.post('/api/auth/sign-up/email', {
    email: address,
    password,
    name: 'Ada Lovelace',
  });
  expect(response.statusCode).toBe(200);
  await browser.get(linkOf(await requestFor('verify-email', address)));
  return browser;
}

describe('sign-in with email and a password', () => {
  it('sends the verification email to notifications, and its link signs the person in', async () => {
    const browser = await signUp('ada@example.com');

    const me = await browser.get('/api/v1/me');

    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      emailVerified: true,
    });
    const request = await requestFor('verify-email', 'ada@example.com');
    expect(request.data).toMatchObject({
      to: { email: 'ada@example.com', name: 'Ada Lovelace' },
      subject: 'Confirm your email address for Template',
      tags: { template: 'verify-email', locale: 'en' },
    });
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

  it('sets a new password through the reset email', async () => {
    await signUp('grace@example.com');
    const visitor = new Browser();
    await visitor.post('/api/auth/request-password-reset', {
      email: 'grace@example.com',
      redirectTo: '/reset-password',
    });
    const landing = await visitor.get(
      linkOf(await requestFor('reset-password', 'grace@example.com'))
    );
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

    const notice = await requestFor('account-exists', 'mary@example.com');
    expect(notice.data.subject).toBe('Someone tried to sign up to Template with your address');
  });

  it('sends that notice once in ten minutes, however often someone tries', async () => {
    await signUp('rosalind@example.com');
    const window = 10 * 60 * 1000;
    const left = window - (Date.now() % window);
    if (left < 15_000) {
      await new Promise((resolve) => setTimeout(resolve, left + 100));
    }
    const before = logs.find('email.requested').length;

    for (const name of ['Someone Else', 'Someone Else Again']) {
      await new Browser().post('/api/auth/sign-up/email', {
        email: 'rosalind@example.com',
        password,
        name,
      });
    }
    const saved = await eventually('two notices in the outbox', () => {
      const lines = logs
        .find('email.requested')
        .slice(before)
        .filter((line) => line.template === 'account-exists');
      return lines.length === 2 ? lines : undefined;
    });
    await signUp('marker@example.com');

    expect(saved[0]?.requestId).toBe(saved[1]?.requestId);
    expect(
      notifications.requests.filter(
        (request) =>
          request.data.tags.template === 'account-exists' &&
          request.data.to.email === 'rosalind@example.com'
      )
    ).toHaveLength(1);
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
  it('deletes the account and its notes through the confirmation link, opened while signed in', async () => {
    const owner = await signUp('barbara@example.com');
    const note = (await owner.post('/api/v1/notes', { title: 'Mine alone' })).json() as NoteBody;
    await owner.post('/api/auth/delete-user', {});
    const request = await requestFor('delete-account', 'barbara@example.com');

    await owner.get(linkOf(request));

    expect((await owner.get('/api/v1/me')).statusCode).toBe(401);
    const again = await new Browser().post('/api/auth/sign-in/email', {
      email: 'barbara@example.com',
      password,
    });
    expect(again.statusCode).toBe(401);
    const gone = await server.app.inject({
      method: 'GET',
      url: `/api/v1/notes/${note.id}`,
      headers: { authorization: `Bearer ${reader}` },
    });
    expectProblem(gone, { status: 404, code: 'note.not_found' });
  });
});

interface NoteBody {
  readonly id: string;
  readonly title: string;
  readonly status: string;
}

interface NotesPage {
  readonly items: readonly NoteBody[];
}

function titlesOf(response: LightMyRequestResponse): string[] {
  return (response.json() as NotesPage).items.map((note) => note.title).sort();
}

describe('the notes of a signed-in person', () => {
  it('lists, reads, changes and deletes only the notes the person wrote', async () => {
    const grace = await signUp('grace.notes@example.com');
    const alan = await signUp('alan.notes@example.com');
    const created = await grace.post('/api/v1/notes', { title: 'Compile the report' });
    expect(created.statusCode).toBe(201);
    const graces = created.json() as NoteBody;
    const alans = (
      await alan.post('/api/v1/notes', { title: 'Break the code' })
    ).json() as NoteBody;

    expect(titlesOf(await grace.get('/api/v1/notes'))).toEqual(['Compile the report']);
    expect(titlesOf(await alan.get('/api/v1/notes'))).toEqual(['Break the code']);
    expect((await grace.get(`/api/v1/notes/${graces.id}`)).json()).toMatchObject({
      title: 'Compile the report',
    });
    const changed = await grace.patch(`/api/v1/notes/${graces.id}`, { status: 'done' });
    expect(changed.json()).toMatchObject({ status: 'done' });

    expectProblem(await grace.get(`/api/v1/notes/${alans.id}`), {
      status: 404,
      code: 'note.not_found',
    });
    expectProblem(await grace.patch(`/api/v1/notes/${alans.id}`, { title: 'Mine now' }), {
      status: 404,
      code: 'note.not_found',
    });
    expectProblem(await grace.delete(`/api/v1/notes/${alans.id}`), {
      status: 404,
      code: 'note.not_found',
    });
    expect((await alan.get(`/api/v1/notes/${alans.id}`)).json()).toMatchObject({
      title: 'Break the code',
    });

    expect((await grace.delete(`/api/v1/notes/${graces.id}`)).statusCode).toBe(204);
    expect(titlesOf(await grace.get('/api/v1/notes'))).toEqual([]);
  });

  it('leaves every note to an API key that has the scope', async () => {
    const katherine = await signUp('katherine.notes@example.com');
    const written = (
      await katherine.post('/api/v1/notes', { title: 'Check the orbit' })
    ).json() as NoteBody;

    const response = await server.app.inject({
      method: 'GET',
      url: `/api/v1/notes/${written.id}`,
      headers: { authorization: `Bearer ${reader}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ title: 'Check the orbit' });
  });
});

describe('the outcomes', () => {
  it('logs the email that notifications sent, and the one it could not send, with its reason', async () => {
    await signUp('lin@example.com');
    const sent = await requestFor('verify-email', 'lin@example.com');
    await new Browser().post('/api/auth/sign-up/email', {
      email: `nobody${refused}`,
      password,
      name: 'Nobody',
    });
    const failed = await requestFor('verify-email', `nobody${refused}`);

    expect(await logOf('email.sent', sent.id)).toMatchObject({ level: 'info', attempts: 1 });
    expect(await logOf('email.failed', failed.id)).toMatchObject({
      level: 'warn',
      reason: 'rejected',
      smtpCode: 550,
    });
  });
});

describe('the logs of the emails', () => {
  it('carry the request and its kind, never the address or the link', () => {
    const lines = logs.lines.filter((line) => String(line.event).startsWith('email.'));

    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(Object.keys(line)).not.toContain('to');
      expect(JSON.stringify(line)).not.toMatch(/@example\.com|token=/);
    }
    expect(logs.find('auth.email_failed')).toEqual([]);
  });
});
