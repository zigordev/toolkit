import type { AuthEmail } from '@zigordev/auth';
import { createLogger } from '@zigordev/otel';
import { captureLogs } from '@zigordev/test/app';
import type { FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import { anyOf, emailOf, heldEmailsKept, holdEmails, languageOf } from './sign-in.ts';

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

describe('holdEmails', () => {
  it('keeps the newest emails, and logs only their kind', async () => {
    const logs = captureLogs();
    const held = holdEmails('Template', createLogger({ service: 'test', destination: logs }));

    for (let index = 0; index <= heldEmailsKept; index += 1) {
      await held.send(message('verify-email'));
    }
    await held.send(message('delete-account'));

    expect(held.emails).toHaveLength(heldEmailsKept);
    expect(held.emails.at(-1)?.message.kind).toBe('delete-account');
    expect(logs.find('auth.email_held').at(-1)).toMatchObject({ kind: 'delete-account' });
    expect(JSON.stringify(logs.lines)).not.toMatch(/ada@example\.com|token=abc/);
  });
});
