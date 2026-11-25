import { useTestDatabase } from '@zigordev/test/postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  Browser,
  cookieAttributes,
  type Harness,
  metricValue,
  registerVerified,
  startHarness,
  strongPassword,
} from '../test/harness.ts';
import { totpCode } from './testing.ts';

const database = useTestDatabase();
const email = 'ada@example.com';
let harness: Harness;
let owner: Browser;
let userId: string;
let totpUri: string;
let backupCodes: string[];
let addresses = 0;

beforeAll(async () => {
  harness = await startHarness({ databaseUrl: database.url });
  owner = new Browser(harness.app);
  userId = await registerVerified(harness, owner, email);
});

afterAll(async () => {
  await harness.close();
});

function from(): Record<string, string> {
  addresses += 1;
  return { 'x-forwarded-for': `10.77.${Math.floor(addresses / 250)}.${(addresses % 250) + 1}` };
}

function signIn(browser: Browser) {
  return browser.post('/api/auth/sign-in/email', { email, password: strongPassword }, from());
}

function wrongCode(): string {
  return String((Number(totpCode(totpUri)) + 1) % 1_000_000).padStart(6, '0');
}

async function twoFactorEnabled(): Promise<boolean | undefined> {
  const [row] = await harness.query<{ two_factor_enabled: boolean }>(
    'select two_factor_enabled from users where id = $1',
    [userId]
  );
  return row?.two_factor_enabled;
}

describe('two-factor sign-in', () => {
  it('turns two-factor on only once the first authenticator code is verified', async () => {
    const enable = await owner.post(
      '/api/auth/two-factor/enable',
      { password: strongPassword },
      from()
    );
    const body = enable.json() as { totpURI: string; backupCodes: string[] };
    totpUri = body.totpURI;
    backupCodes = body.backupCodes;

    expect(enable.statusCode).toBe(200);
    expect(backupCodes).toHaveLength(10);
    expect(new URL(totpUri).searchParams.get('issuer')).toBe('toolkit');
    expect(await twoFactorEnabled()).toBe(false);
    const signedInBefore = harness.events('auth.signed_in').length;
    const signInsBefore = await metricValue(harness.reader, 'auth.user.sign_ins', {
      method: 'email',
      outcome: 'success',
    });

    const verify = await owner.post(
      '/api/auth/two-factor/verify-totp',
      { code: totpCode(totpUri) },
      from()
    );

    expect(verify.statusCode).toBe(200);
    expect(await twoFactorEnabled()).toBe(true);
    expect(harness.events('auth.two_factor_enabled')).toEqual([
      expect.objectContaining({ level: 'info', userId }),
    ]);
    expect(harness.events('auth.signed_in')).toHaveLength(signedInBefore);
    expect(
      await metricValue(harness.reader, 'auth.user.sign_ins', {
        method: 'email',
        outcome: 'success',
      })
    ).toBe(signInsBefore);
    const [row] = await harness.query<{ secret: string; backup_codes: string }>(
      'select secret, backup_codes from two_factors where user_id = $1',
      [userId]
    );
    expect(row?.secret).not.toContain(new URL(totpUri).searchParams.get('secret'));
    expect(row?.backup_codes).not.toContain(backupCodes[0]);
  });

  it('asks for a code after the password and starts the session only when it is right', async () => {
    const browser = new Browser(harness.app);
    const signedInBefore = harness.events('auth.signed_in').length;

    const password = await signIn(browser);

    expect(password.statusCode).toBe(200);
    expect(password.json()).toMatchObject({ twoFactorRedirect: true, twoFactorMethods: ['totp'] });
    expect(browser.cookie('toolkit.session_token')).toBeUndefined();
    expect(harness.events('auth.signed_in')).toHaveLength(signedInBefore);

    const code = await browser.post(
      '/api/auth/two-factor/verify-totp',
      { code: totpCode(totpUri) },
      from()
    );

    expect(code.statusCode).toBe(200);
    expect((await browser.get('/api/v1/me')).json()).toMatchObject({ id: userId });
    expect(harness.events('auth.signed_in')).toHaveLength(signedInBefore + 1);
    expect(harness.events('auth.signed_in').at(-1)).toMatchObject({ method: 'email', userId });
  });

  it('refuses a wrong code and logs the failed sign-in', async () => {
    const browser = new Browser(harness.app);
    await signIn(browser);

    const response = await browser.post(
      '/api/auth/two-factor/verify-totp',
      { code: wrongCode() },
      from()
    );

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'INVALID_CODE' });
    expect(browser.cookie('toolkit.session_token')).toBeUndefined();
    expect(harness.events('auth.sign_in_failed').at(-1)).toMatchObject({
      method: 'email',
      reason: 'invalid_code',
    });
  });

  it('accepts each backup code once', async () => {
    const first = new Browser(harness.app);
    await signIn(first);
    const used = await first.post(
      '/api/auth/two-factor/verify-backup-code',
      { code: backupCodes[0] },
      from()
    );
    const second = new Browser(harness.app);
    await signIn(second);
    const again = await second.post(
      '/api/auth/two-factor/verify-backup-code',
      { code: backupCodes[0] },
      from()
    );

    expect(used.statusCode).toBe(200);
    expect(first.cookie('toolkit.session_token')).toBeDefined();
    expect(again.statusCode).toBe(401);
    expect(second.cookie('toolkit.session_token')).toBeUndefined();
  });

  it('skips the code for 30 days on a device the user trusts', async () => {
    const browser = new Browser(harness.app);
    await signIn(browser);
    const trusted = await browser.post(
      '/api/auth/two-factor/verify-totp',
      { code: totpCode(totpUri), trustDevice: true },
      from()
    );
    expect(cookieAttributes(trusted, 'toolkit.trust_device')).toMatch(/Max-Age=2592000/);
    await browser.post('/api/auth/sign-out', {}, from());

    const next = await signIn(browser);

    expect(next.statusCode).toBe(200);
    expect(next.json()).not.toHaveProperty('twoFactorRedirect');
    expect(browser.cookie('toolkit.session_token')).toBeDefined();
  });

  it('locks the account for 15 minutes after 10 wrong codes in a row', async () => {
    for (let challenge = 0; challenge < 2; challenge += 1) {
      const browser = new Browser(harness.app);
      await signIn(browser);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await browser.post('/api/auth/two-factor/verify-totp', { code: wrongCode() }, from());
      }
    }
    const browser = new Browser(harness.app);
    await signIn(browser);

    const locked = await browser.post(
      '/api/auth/two-factor/verify-totp',
      { code: totpCode(totpUri) },
      from()
    );

    expect(locked.json()).toMatchObject({ code: 'ACCOUNT_TEMPORARILY_LOCKED' });
    expect(browser.cookie('toolkit.session_token')).toBeUndefined();
    const [row] = await harness.query<{ minutes: number }>(
      'select extract(epoch from (locked_until - now())) / 60 as minutes from two_factors where user_id = $1',
      [userId]
    );
    expect(Number(row?.minutes)).toBeGreaterThan(14);
    expect(Number(row?.minutes)).toBeLessThanOrEqual(15);
  });

  it('turns two-factor off with the password, after which the password alone signs in', async () => {
    const disable = await owner.post(
      '/api/auth/two-factor/disable',
      { password: strongPassword },
      from()
    );
    const browser = new Browser(harness.app);
    const next = await signIn(browser);

    expect(disable.statusCode).toBe(200);
    expect(await twoFactorEnabled()).toBe(false);
    expect(harness.events('auth.two_factor_disabled')).toEqual([
      expect.objectContaining({ userId }),
    ]);
    expect(next.json()).not.toHaveProperty('twoFactorRedirect');
    expect(browser.cookie('toolkit.session_token')).toBeDefined();
  });
});

describe('two-factor turned off', () => {
  const offDatabase = useTestDatabase();
  let off: Harness;

  beforeAll(async () => {
    off = await startHarness({ databaseUrl: offDatabase.url, twoFactor: false });
  });

  afterAll(async () => {
    await off.close();
  });

  it('serves no two-factor endpoints', async () => {
    const browser = new Browser(off.app);
    await registerVerified(off, browser, 'plain@example.com');

    const response = await browser.post('/api/auth/two-factor/enable', {
      password: strongPassword,
    });

    expect(response.statusCode).toBe(404);
  });
});
