import type { AuthEmail } from '@zigordev/auth';
import type { Database } from '@zigordev/events';
import { createLogger } from '@zigordev/otel';
import { captureLogs } from '@zigordev/test/app';
import type { FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import { requestIdOf } from './emails.ts';
import { anyOf, authEmailRequest, emailOf, languageOf, sendAuthEmails } from './sign-in.ts';

const request = {} as FastifyRequest;

function message(kind: AuthEmail['kind'], language?: string): AuthEmail {
  const base = {
    to: 'ada@example.com',
    name: 'Ada',
    idempotencyKey: 'key',
    request:
      language === undefined
        ? undefined
        : new Request('http://template.localhost', { headers: { 'accept-language': language } }),
  };
  return kind === 'account-exists'
    ? { kind, ...base }
    : { kind, ...base, url: 'http://template.localhost/api/auth/link?token=abc' };
}

describe('anyOf', () => {
  it('takes the first way that knows the request, and nobody when none does', async () => {
    const key = { id: 'reader', scopes: ['notes:read'] };
    const session = { id: 'ada', scopes: [] };

    expect(
      await anyOf(
        () => undefined,
        () => session
      )(request)
    ).toBe(session);
    expect(
      await anyOf(
        async () => key,
        () => session
      )(request)
    ).toBe(key);
    expect(await anyOf(() => undefined)(request)).toBeUndefined();
  });
});

describe('languageOf', () => {
  it('picks the first language the browser asks for that the emails speak', () => {
    const asking = (header: string) =>
      new Request('http://template.localhost', { headers: { 'accept-language': header } });

    expect(languageOf(asking('es-ES,es;q=0.9,en;q=0.8'))).toBe('es');
    expect(languageOf(asking('fr-FR, en-GB;q=0.7'))).toBe('en');
    expect(languageOf(asking('de'))).toBe('en');
    expect(languageOf(undefined)).toBe('en');
  });
});

describe('emailOf', () => {
  it('builds each of the four messages, in the language of the request', () => {
    expect(emailOf(message('verify-email'), 'Template').subject).toBe(
      'Confirm your email address for Template'
    );
    expect(emailOf(message('reset-password', 'es'), 'Template').subject).toBe(
      'Elige una contraseña nueva para Template'
    );
    expect(emailOf(message('account-exists'), 'Template').html).not.toContain('token=abc');
    expect(emailOf(message('delete-account'), 'Template').html).toContain(
      'href="http://template.localhost/api/auth/link?token=abc"'
    );
  });
});

describe('authEmailRequest', () => {
  it('asks for the email as rendered, to the person by name, labelled with its kind and language', () => {
    const request = authEmailRequest(message('reset-password', 'es'), 'Template');

    expect(request).toEqual({
      to: { email: 'ada@example.com', name: 'Ada' },
      subject: 'Elige una contraseña nueva para Template',
      html: expect.stringContaining('token=abc'),
      text: expect.stringContaining('token=abc'),
      tags: { template: 'reset-password', locale: 'es' },
    });
  });

  it('leaves out a name that an address header cannot carry', () => {
    for (const name of ['', '   ', 'Ada\nBcc: eve@example.com', 'a'.repeat(201)]) {
      expect(authEmailRequest({ ...message('account-exists'), name }, 'Template').to).toEqual({
        email: 'ada@example.com',
      });
    }
  });
});

interface SavedRow {
  readonly topic: string;
  readonly key: string;
  readonly value: { readonly id: string; readonly type: string; readonly data: unknown };
}

function outbox(): { readonly db: Database; readonly rows: SavedRow[] } {
  const rows: SavedRow[] = [];
  const db = {
    insert: () => ({
      values: async (row: SavedRow) => {
        rows.push(row);
      },
    }),
  } as unknown as Database;
  return { db, rows };
}

describe('sendAuthEmails', () => {
  it('saves a request event in the outbox, with an id that its key decides, and logs no address', async () => {
    const logs = captureLogs();
    const { db, rows } = outbox();
    const send = sendAuthEmails({
      db,
      app: 'template-api',
      topic: 'notifications.requests.template-api',
      product: 'Template',
      logger: createLogger({ service: 'test', destination: logs }),
    });

    await send(message('verify-email'));
    await send(message('verify-email'));

    const id = requestIdOf('template-api', 'key');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      topic: 'notifications.requests.template-api',
      key: id,
      value: { id, type: 'email.requested', data: { to: { email: 'ada@example.com' } } },
    });
    expect(rows[1]?.value.id).toBe(id);
    expect(logs.find('email.requested')).toEqual([
      expect.objectContaining({ requestId: id, template: 'verify-email' }),
      expect.objectContaining({ requestId: id, template: 'verify-email' }),
    ]);
    expect(JSON.stringify(logs.lines)).not.toMatch(/ada@example\.com|token=abc/);
  });

  it('fails, and saves nothing, when the address is no address', async () => {
    const { db, rows } = outbox();
    const send = sendAuthEmails({
      db,
      app: 'template-api',
      topic: 'notifications.requests.template-api',
      product: 'Template',
      logger: createLogger({ service: 'test', destination: captureLogs() }),
    });

    await expect(send({ ...message('verify-email'), to: 'not an address' })).rejects.toThrow();
    expect(rows).toEqual([]);
  });
});
