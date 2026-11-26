import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asHtml, textsIn } from '../../../test/texts.ts';
import { messagesOf } from '../../i18n/messages.ts';

const request = vi.hoisted(() => ({ cookie: '' }));

vi.mock('next/headers.js', () => ({
  headers: async () => new Headers(request.cookie === '' ? {} : { cookie: request.cookie }),
}));

const session = {
  user: {
    id: '01938c2e-0000-7000-8000-000000000001',
    email: 'ada@example.com',
    name: 'Ada Lovelace',
    emailVerified: true,
    image: null,
    createdAt: '2026-11-25T10:00:00.000Z',
    updatedAt: '2026-11-25T10:00:00.000Z',
  },
  session: {
    id: '01938c2e-0000-7000-8000-000000000002',
    userId: '01938c2e-0000-7000-8000-000000000001',
    expiresAt: '2026-12-02T10:00:00.000Z',
    createdAt: '2026-11-25T10:00:00.000Z',
    updatedAt: '2026-11-25T10:00:00.000Z',
  },
};

let server: Server;
const t = textsIn('en');
const text = (value: string) => asHtml(value);

function render(page: ReactNode): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messagesOf('en')}>
      {page}
    </NextIntlClientProvider>
  );
}

beforeEach(async () => {
  server = createServer((incoming, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(incoming.headers.cookie === undefined ? null : session));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  vi.stubEnv('OTEL_SERVICE_NAME', 'template-web');
  vi.stubEnv('LOG_LEVEL', 'error');
  vi.stubEnv('API_URL', `http://127.0.0.1:${(server.address() as AddressInfo).port}`);
});

afterEach(async () => {
  request.cookie = '';
  await new Promise((resolve) => server.close(resolve));
  vi.unstubAllEnvs();
  vi.resetModules();
  Reflect.deleteProperty(globalThis, Symbol.for('zigordev.template-web.logger'));
});

describe('the sign-in page', () => {
  it('offers the password, Google and a passkey, and the way to sign up', async () => {
    const { default: SignIn } = await import('./page.tsx');

    const html = render(await SignIn({ searchParams: Promise.resolve({}) }));

    expect(html).toContain(`<h1>${text(t('signIn.title'))}</h1>`);
    expect(html).toContain('name="email"');
    expect(html).toContain(text(t('signIn.google')));
    expect(html).toContain(text(t('signIn.passkey')));
    expect(html).toContain('href="/sign-up"');
  });

  it('sends a person who is signed in on to where they were going', async () => {
    request.cookie = 'template.session_token=abc';
    const { default: SignIn } = await import('./page.tsx');

    await expect(
      SignIn({ searchParams: Promise.resolve({ next: '/notes' }) })
    ).rejects.toMatchObject({
      digest: expect.stringContaining(';/notes;'),
    });
  });
});

describe('the account page', () => {
  it('shows who is signed in, with passkeys, two-factor, signing out and deletion', async () => {
    request.cookie = 'template.session_token=abc';
    const { default: Account } = await import('../account/page.tsx');

    const html = render(await Account());

    expect(html).toContain(
      text(t('account.who', { name: 'Ada Lovelace', email: 'ada@example.com' }))
    );
    expect(html).toContain(text(t('account.addPasskey')));
    expect(html).toContain(text(t('account.turnOn')));
    expect(html).toContain(text(t('account.signOut')));
    expect(html).toContain(text(t('account.delete')));
  });

  it('sends a person who is not signed in to the sign-in page, and back afterwards', async () => {
    const { default: Account } = await import('../account/page.tsx');

    await expect(Account()).rejects.toMatchObject({
      digest: expect.stringContaining('/sign-in?next=%2Faccount'),
    });
  });
});

describe('the sign-up and two-factor pages', () => {
  it('ask for a name, an email and a password of 15 to 128 characters', async () => {
    const { default: SignUp } = await import('../sign-up/page.tsx');

    const html = render(await SignUp());

    expect(html).toContain('name="name"');
    expect(html).toContain(text(t('signUp.passwordHint', { min: 15, max: 128 })));
    expect(html).toContain('minLength="15"');
    expect(html).toContain('maxLength="128"');
    expect(html).toContain('href="/sign-in"');
  });

  it('take a code from the authenticator app or a backup code, and can trust the device', async () => {
    const { default: TwoFactor } = await import('../two-factor/page.tsx');

    const html = render(await TwoFactor());

    expect(html).toContain('name="code"');
    expect(html).toContain(text(t('twoFactor.trust', { days: 30 })));
  });
});
