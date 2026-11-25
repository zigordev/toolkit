import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createLogger } from '@zigordev/otel';
import { useTestDatabase } from '@zigordev/test/postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  appUrl,
  Browser,
  type Harness,
  registerVerified,
  startHarness,
  strongPassword,
} from '../test/harness.ts';
import { createNextAuth, fetchSessionFromApi, forwardToApi, signInUrl } from './next.ts';

const database = useTestDatabase();
let harness: Harness;
let apiUrl: string;
let cookie: string;
let userId: string;
let sessionReads = 0;

beforeAll(async () => {
  harness = await startHarness({
    databaseUrl: database.url,
    configure: (app) => {
      app.addHook('onRequest', async (request) => {
        if (request.url.startsWith('/api/auth/get-session')) {
          sessionReads += 1;
        }
      });
    },
  });
  await harness.app.listen({ port: 0, host: '127.0.0.1' });
  apiUrl = `http://127.0.0.1:${(harness.app.server.address() as AddressInfo).port}`;
  const browser = new Browser(harness.app);
  userId = await registerVerified(harness, browser, 'ada@example.com');
  cookie = browser.cookieHeader();
});

afterAll(async () => {
  await harness.close();
});

class Redirected extends Error {
  readonly url: string;

  constructor(url: string) {
    super(`redirected to ${url}`);
    this.url = url;
  }
}

function redirect(url: string): never {
  throw new Redirected(url);
}

function webRequest(path: string, init: RequestInit = {}): Request {
  return new Request(new URL(path, appUrl), init);
}

describe('forwarding /api/auth/* from the web app to the API', () => {
  it('forwards a sign-up with its body, origin and client address', async () => {
    const forward = forwardToApi(apiUrl);

    const response = await forward(
      webRequest('/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          origin: appUrl,
          'content-type': 'application/json',
          'x-forwarded-for': '10.1.1.1',
        },
        body: JSON.stringify({
          email: 'grace@example.com',
          password: strongPassword,
          name: 'Grace',
        }),
      })
    );
    await harness.auth.settle();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ user: { email: 'grace@example.com' } });
    expect(harness.outbox.at(-1)).toMatchObject({ kind: 'verify-email', to: 'grace@example.com' });
  });

  it('passes redirects and every Set-Cookie header back to the browser', async () => {
    const forward = forwardToApi(apiUrl);
    const message = harness.outbox.at(-1);
    if (message?.kind !== 'verify-email') {
      throw new Error('no verification email');
    }
    const link = new URL(message.url);

    const response = await forward(webRequest(`${link.pathname}${link.search}`));

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/');
    expect(
      response.headers.getSetCookie().some((value) => value.startsWith('toolkit.session_token='))
    ).toBe(true);
  });

  it('answers 502 in Better Auth error shape when the API is unreachable, and logs it', async () => {
    const lines: string[] = [];
    const logger = createLogger({
      service: 'toolkit-auth-test',
      destination: { write: (line: string) => lines.push(line) },
    });
    const forward = forwardToApi('http://127.0.0.1:1', logger);

    const response = await forward(webRequest('/api/auth/get-session'));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      code: 'AUTH_UNAVAILABLE',
      message: 'Sign-in is unavailable. Try again shortly.',
    });
    expect(lines.map((line) => JSON.parse(line).event)).toEqual(['auth.api_unreachable']);
  });

  it('refuses an API address with a path', () => {
    expect(() => forwardToApi('http://api.internal:3000/v1')).toThrow(/origin with no path/);
  });
});

describe('reading the session from the API', () => {
  it('returns the user for a session cookie, without the session token', async () => {
    const session = await fetchSessionFromApi(
      apiUrl,
      new Headers({ cookie, 'user-agent': 'next-server', 'x-forwarded-for': '10.3.3.3' })
    );

    expect(session?.user).toMatchObject({ id: userId, email: 'ada@example.com' });
    expect(session?.session).not.toHaveProperty('token');
  });

  it('returns null without asking the API when there is no cookie', async () => {
    expect(await fetchSessionFromApi('http://127.0.0.1:1', new Headers())).toBeNull();
  });

  it('throws when the API answers with an error', async () => {
    const failing = createServer((_request, response) => {
      response.writeHead(500).end();
    });
    await new Promise<void>((resolve) => failing.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(failing.address() as AddressInfo).port}`;

    await expect(fetchSessionFromApi(url, new Headers({ cookie }))).rejects.toThrow(/answered 500/);
    await new Promise((resolve) => failing.close(resolve));
  });
});

describe('createNextAuth with the API running auth', () => {
  it('reads the user once per request and passes signed-in users through', async () => {
    const headers = new Headers({ cookie });
    const nextAuth = createNextAuth({ apiUrl, headers: async () => headers, redirect });
    const before = sessionReads;

    const user = await nextAuth.getUser();
    const required = await nextAuth.requireUser('/account');

    expect(user).toMatchObject({ id: userId });
    expect(required).toMatchObject({ id: userId });
    expect(sessionReads - before).toBe(1);
  });

  it('sends visitors without a session to the sign-in page with a return path', async () => {
    const nextAuth = createNextAuth({
      apiUrl,
      signInPath: '/en/sign-in',
      headers: async () => new Headers(),
      redirect,
    });

    expect(await nextAuth.getUser()).toBeNull();
    await expect(nextAuth.requireUser('/account?tab=security')).rejects.toEqual(
      new Redirected('/en/sign-in?next=%2Faccount%3Ftab%3Dsecurity')
    );
  });

  it('forwards both route handlers to the API', async () => {
    const { handlers } = createNextAuth({ apiUrl, headers: async () => new Headers(), redirect });

    const response = await handlers.GET(
      webRequest('/api/auth/get-session', { headers: { cookie } })
    );

    expect(await response.json()).toMatchObject({ user: { id: userId } });
    expect(handlers.POST).toBe(handlers.GET);
  });
});

describe('createNextAuth with Next.js running auth', () => {
  it('serves the auth routes and reads the session in process', async () => {
    const headers = new Headers({ cookie });
    const nextAuth = createNextAuth({ auth: harness.auth, headers: async () => headers, redirect });

    const signIn = await nextAuth.handlers.POST(
      webRequest('/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          origin: appUrl,
          'content-type': 'application/json',
          'x-forwarded-for': '10.2.2.2',
        },
        body: JSON.stringify({ email: 'ada@example.com', password: strongPassword }),
      })
    );
    const session = await nextAuth.handlers.GET(
      webRequest('/api/auth/get-session', { headers: { cookie } })
    );

    expect(signIn.status).toBe(200);
    expect(await session.json()).toMatchObject({ user: { id: userId } });
    expect(await nextAuth.getUser()).toMatchObject({ id: userId });
    expect(await nextAuth.getSession()).toMatchObject({ session: { userId } });
  });

  it('uses Next.js headers and redirect when none are passed in', async () => {
    const nextAuth = createNextAuth({ auth: harness.auth });

    await expect(nextAuth.getUser()).rejects.toThrow();
  });

  it('throws the Next.js redirect when no redirect is passed in', async () => {
    const nextAuth = createNextAuth({ auth: harness.auth, headers: async () => new Headers() });

    await expect(nextAuth.requireUser()).rejects.toMatchObject({
      digest: expect.stringContaining('NEXT_REDIRECT'),
    });
  });
});

describe('signInUrl', () => {
  it('keeps only local return paths', () => {
    expect(signInUrl('/sign-in', '/pools/1')).toBe('/sign-in?next=%2Fpools%2F1');
    expect(signInUrl('/sign-in', '//evil.example.net')).toBe('/sign-in?next=%2F');
    expect(signInUrl('/sign-in', 'https://evil.example.net')).toBe('/sign-in?next=%2F');
  });
});
