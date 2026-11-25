import { useTestDatabase } from '@zigordev/test/postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  appUrl,
  Browser,
  type Harness,
  metricValue,
  registerVerified,
  startHarness,
} from '../test/harness.ts';
import {
  createSoftwarePasskey,
  type PasskeyCreationOptions,
  type PasskeyRequestOptions,
  type SoftwarePasskey,
} from './testing.ts';

const database = useTestDatabase();
let harness: Harness;
let owner: Browser;
let userId: string;
const laptop = createSoftwarePasskey();

beforeAll(async () => {
  harness = await startHarness({ databaseUrl: database.url, methods: ['email', 'passkey'] });
  owner = new Browser(harness.app);
  userId = await registerVerified(harness, owner, 'ada@example.com');
});

afterAll(async () => {
  await harness.close();
});

async function addPasskey(browser: Browser, passkey: SoftwarePasskey, name: string) {
  const options = await browser.get('/api/auth/passkey/generate-register-options');
  if (options.statusCode !== 200) {
    return options;
  }
  const creation = options.json() as PasskeyCreationOptions;
  return browser.post('/api/auth/passkey/verify-registration', {
    response: passkey.register(creation, appUrl),
    name,
  });
}

async function signInWithPasskey(browser: Browser, passkey: SoftwarePasskey, origin = appUrl) {
  const options = await browser.get('/api/auth/passkey/generate-authenticate-options');
  const request = options.json() as PasskeyRequestOptions;
  return browser.post('/api/auth/passkey/verify-authentication', {
    response: passkey.assert(request, origin),
  });
}

describe('passkeys', () => {
  it('lets a signed-in user add a named passkey for the app domain', async () => {
    const response = await addPasskey(owner, laptop, 'Laptop');

    expect(response.statusCode).toBe(200);
    const rows = await harness.query<{ user_id: string; name: string; credential_id: string }>(
      'select user_id, name, credential_id from passkeys'
    );
    expect(rows).toEqual([{ user_id: userId, name: 'Laptop', credential_id: laptop.credentialId }]);
    expect(harness.events('auth.passkey_added')).toEqual([
      expect.objectContaining({ level: 'info', userId }),
    ]);
  });

  it('asks the authenticator for a discoverable passkey with user verification', async () => {
    const response = await owner.get('/api/auth/passkey/generate-register-options');

    expect(response.json()).toMatchObject({
      rp: { id: 'localhost', name: 'toolkit' },
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });
  });

  it('signs the user in with the passkey', async () => {
    const browser = new Browser(harness.app);

    const response = await signInWithPasskey(browser, laptop);

    expect(response.statusCode).toBe(200);
    expect(browser.cookie('toolkit.session_token')).toBeDefined();
    expect((await browser.get('/api/v1/me')).json()).toMatchObject({ id: userId });
    expect(harness.events('auth.signed_in').at(-1)).toMatchObject({ method: 'passkey', userId });
    expect(
      await metricValue(harness.reader, 'auth.user.sign_ins', {
        method: 'passkey',
        outcome: 'success',
      })
    ).toBe(1);
    const [row] = await harness.query<{ counter: number }>('select counter from passkeys');
    expect(row?.counter).toBe(1);
  });

  it('refuses a passkey the app never registered', async () => {
    const browser = new Browser(harness.app);

    const response = await signInWithPasskey(browser, createSoftwarePasskey());

    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.statusCode).toBeLessThan(500);
    expect(browser.cookie('toolkit.session_token')).toBeUndefined();
    expect(harness.events('auth.sign_in_failed').at(-1)).toMatchObject({ method: 'passkey' });
  });

  it('refuses an assertion made for another origin', async () => {
    const browser = new Browser(harness.app);

    const response = await signInWithPasskey(browser, laptop, 'https://evil.example.net');

    expect(response.statusCode).toBe(400);
    expect(browser.cookie('toolkit.session_token')).toBeUndefined();
  });

  it('needs a recent sign-in to add a passkey', async () => {
    const stale = new Browser(harness.app);
    await stale.post('/api/auth/sign-in/email', {
      email: 'ada@example.com',
      password: 'correct horse battery staple',
    });
    await harness.query(
      "update sessions set created_at = now() - interval '2 days' where id = (select id from sessions order by created_at desc limit 1)"
    );

    const response = await addPasskey(stale, createSoftwarePasskey(), 'Old laptop');

    expect(response.statusCode).toBe(403);
  });

  it('lists the passkeys and removes one', async () => {
    const listed = await owner.get('/api/auth/passkey/list-user-passkeys');
    const [passkey] = listed.json() as { id: string; name: string }[];

    const removed = await owner.post('/api/auth/passkey/delete-passkey', { id: passkey?.id });

    expect(passkey?.name).toBe('Laptop');
    expect(removed.statusCode).toBe(200);
    expect(await harness.query('select id from passkeys')).toEqual([]);
    expect(harness.events('auth.passkey_removed')).toEqual([expect.objectContaining({ userId })]);
  });
});
