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

const database = useTestDatabase();
const deletedData: string[] = [];
let failNextCleanup = false;
let harness: Harness;

beforeAll(async () => {
  harness = await startHarness({
    databaseUrl: database.url,
    deleteUserData: async (userId) => {
      if (failNextCleanup) {
        failNextCleanup = false;
        throw new Error('the app could not remove its data');
      }
      deletedData.push(userId);
    },
  });
});

afterAll(async () => {
  await harness.close();
});

async function requestDeletion(browser: Browser) {
  const response = await browser.post('/api/auth/delete-user', { callbackURL: '/goodbye' });
  await harness.auth.settle();
  const message = harness.outbox.at(-1);
  if (message?.kind !== 'delete-account') {
    throw new Error('no deletion email');
  }
  return { response, message };
}

async function userCount(email: string): Promise<number> {
  const rows = await harness.query<{ count: string }>(
    'select count(*) from users where email = $1',
    [email]
  );
  return Number(rows[0]?.count);
}

describe('account deletion', () => {
  it('emails a one-hour confirmation link and deletes nothing yet', async () => {
    const browser = new Browser(harness.app);
    await registerVerified(harness, browser, 'ada@example.com');

    const { response, message } = await requestDeletion(browser);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true, message: 'Verification email sent' });
    expect(message).toMatchObject({ kind: 'delete-account', to: 'ada@example.com' });
    expect(message.url).toMatch(
      new RegExp(`^${appUrl}/api/auth/delete-user/callback\\?token=\\w+&callbackURL=%2Fgoodbye$`)
    );
    expect(message.idempotencyKey).toMatch(/^auth-delete-account-[0-9a-f]{64}$/);
    expect(await userCount('ada@example.com')).toBe(1);
    const [row] = await harness.query<{ minutes: number }>(
      'select extract(epoch from (max(expires_at) - now())) / 60 as minutes from verifications'
    );
    expect(Number(row?.minutes)).toBeGreaterThan(58);
    expect(Number(row?.minutes)).toBeLessThanOrEqual(60);
  });

  it('needs the owner to be signed in when they open the link', async () => {
    const message = harness.outbox.at(-1);
    if (message?.kind !== 'delete-account') {
      throw new Error('no deletion email');
    }
    const stranger = new Browser(harness.app);
    await registerVerified(harness, stranger, 'mallory@example.com');

    const signedOut = await new Browser(harness.app).visit(message.url);
    const otherUser = await stranger.visit(message.url);

    expect(signedOut.statusCode).toBe(404);
    expect(otherUser.statusCode).toBe(404);
    expect(await userCount('ada@example.com')).toBe(1);
  });

  it('deletes the account, its sessions, its accounts and the app data when the owner confirms', async () => {
    const browser = new Browser(harness.app);
    const userId = await registerVerified(harness, browser, 'grace@example.com');
    const { message } = await requestDeletion(browser);

    const confirmed = await browser.visit(message.url);

    expect(confirmed.statusCode).toBe(302);
    expect(confirmed.headers.location).toBe('/goodbye');
    expect(browser.cookie('toolkit.session_token')).toBeUndefined();
    expect(await userCount('grace@example.com')).toBe(0);
    expect(await harness.query('select id from sessions where user_id = $1', [userId])).toEqual([]);
    expect(await harness.query('select id from accounts where user_id = $1', [userId])).toEqual([]);
    expect(deletedData).toEqual([userId]);
    expect(harness.events('auth.account_deleted')).toEqual([
      expect.objectContaining({ level: 'info', userId }),
    ]);
    expect(await metricValue(harness.reader, 'auth.user.deletions', {})).toBe(1);

    const again = await browser.visit(message.url);
    expect(again.statusCode).toBe(404);
  });

  it('keeps the account when the app cannot remove its own data', async () => {
    const browser = new Browser(harness.app);
    const userId = await registerVerified(harness, browser, 'kept@example.com');
    const { message } = await requestDeletion(browser);
    failNextCleanup = true;

    const confirmed = await browser.visit(message.url);

    expect(confirmed.statusCode).toBeGreaterThanOrEqual(500);
    expect(await userCount('kept@example.com')).toBe(1);
    expect(harness.events('auth.account_deletion_failed')).toEqual([
      expect.objectContaining({ level: 'error', userId }),
    ]);
  });

  it('refuses a deletion request without a session', async () => {
    const response = await new Browser(harness.app).post('/api/auth/delete-user', {});

    expect(response.statusCode).toBe(401);
  });

  it('refuses an expired link', async () => {
    const browser = new Browser(harness.app);
    await registerVerified(harness, browser, 'late@example.com');
    const { message } = await requestDeletion(browser);
    await harness.query("update verifications set expires_at = now() - interval '1 minute'");

    const confirmed = await browser.visit(message.url);

    expect(confirmed.statusCode).toBe(404);
    expect(await userCount('late@example.com')).toBe(1);
  });
});

describe('account deletion turned off', () => {
  const offDatabase = useTestDatabase();
  let off: Harness;

  beforeAll(async () => {
    off = await startHarness({ databaseUrl: offDatabase.url, accountDeletion: false });
  });

  afterAll(async () => {
    await off.close();
  });

  it('answers 404 and counts no deletions', async () => {
    const browser = new Browser(off.app);
    await registerVerified(off, browser, 'stay@example.com');

    const response = await browser.post('/api/auth/delete-user', {});

    expect(response.statusCode).toBe(404);
    expect(await metricValue(off.reader, 'auth.user.deletions', {})).toBeUndefined();
  });
});
