import { useTestDatabase } from '@zigordev/test/postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  Browser,
  cookieAttributes,
  type Harness,
  registerVerified,
  startHarness,
  strongPassword,
} from '../test/harness.ts';
import { appOrigins } from './create-auth.ts';

const database = useTestDatabase();

function fromApp(harness: Harness, scheme: string, url: string, body: unknown, cookie?: string) {
  return harness.app.inject({
    method: 'POST',
    url,
    headers: {
      'expo-origin': `${scheme}://`,
      'content-type': 'application/json',
      'x-forwarded-for': '10.9.9.9',
      'user-agent': 'toolkit-auth-test',
      ...(cookie === undefined ? {} : { cookie }),
    },
    payload: JSON.stringify(body),
  });
}

async function sessionCookie(harness: Harness, email: string): Promise<string> {
  const browser = new Browser(harness.app);
  await browser.post('/api/auth/sign-in/email', { email, password: strongPassword });
  return `toolkit.session_token=${browser.cookie('toolkit.session_token') ?? ''}`;
}

describe('a phone app that signs in', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness({ databaseUrl: database.url, appSchemes: ['template'] });
    await registerVerified(harness, new Browser(harness.app), 'ada.phone@example.com');
  });

  afterAll(async () => {
    await harness.close();
  });

  it('signs in with a password from the scheme the app was given, and gets its session cookie', async () => {
    const response = await fromApp(harness, 'template', '/api/auth/sign-in/email', {
      email: 'ada.phone@example.com',
      password: strongPassword,
    });

    expect(response.statusCode).toBe(200);
    expect(cookieAttributes(response, 'toolkit.session_token')).not.toBeNull();
  });

  it('refuses a scheme it was not given', async () => {
    const response = await fromApp(harness, 'stranger', '/api/auth/sign-in/email', {
      email: 'ada.phone@example.com',
      password: strongPassword,
    });

    expect(response.statusCode).toBe(403);
  });

  it('takes a signed-in request from the app, with its session cookie', async () => {
    const cookie = await sessionCookie(harness, 'ada.phone@example.com');

    const response = await fromApp(harness, 'template', '/api/auth/sign-out', {}, cookie);

    expect(response.statusCode).toBe(200);
  });

  it('still signs the web app in from its own address', async () => {
    const browser = new Browser(harness.app);
    const response = await browser.post('/api/auth/sign-in/email', {
      email: 'ada.phone@example.com',
      password: strongPassword,
    });

    expect(response.statusCode).toBe(200);
  });
});

describe('an API without app schemes', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness({ databaseUrl: database.url });
    await registerVerified(harness, new Browser(harness.app), 'grace.phone@example.com');
  });

  afterAll(async () => {
    await harness.close();
  });

  it('refuses a signed-in request from a phone app, which sends no origin of its own', async () => {
    const cookie = await sessionCookie(harness, 'grace.phone@example.com');

    const response = await fromApp(harness, 'template', '/api/auth/sign-out', {}, cookie);

    expect(response.statusCode).toBe(403);
  });
});

describe('appOrigins', () => {
  it('turns each scheme into the origin a phone app sends', () => {
    expect(appOrigins(['template', 'gpool'])).toEqual(['template://', 'gpool://']);
    expect(appOrigins([])).toEqual([]);
  });

  it('refuses a scheme a phone could not open', () => {
    expect(() => appOrigins(['Template'])).toThrow(/lower case/);
    expect(() => appOrigins(['template://'])).toThrow(/no colon/);
    expect(() => appOrigins(['1st'])).toThrow(/starts with a letter/);
  });
});
