import { readFileSync } from 'node:fs';
import { useTestDatabase } from '@zigordev/test/postgres';
import { getAuthTables } from 'better-auth/db';
import { getTableColumns, getTableName } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Harness, startHarness } from '../test/harness.ts';
import { authTables } from './drizzle.ts';

const database = useTestDatabase();
let harness: Harness;

beforeAll(async () => {
  harness = await startHarness({
    databaseUrl: database.url,
    methods: ['email', 'google', 'passkey'],
    config: { AUTH_GOOGLE_CLIENT_ID: 'id', AUTH_GOOGLE_CLIENT_SECRET: 'secret' },
  });
});

afterAll(async () => {
  await harness.close();
});

const tableFor: Record<string, keyof typeof authTables> = {
  user: 'users',
  session: 'sessions',
  account: 'accounts',
  passkey: 'passkeys',
  twoFactor: 'twoFactors',
  verification: 'verifications',
  rateLimit: 'rateLimits',
};

describe('the auth tables', () => {
  it('hold every field Better Auth writes, with the same nullability', () => {
    const expected = getAuthTables(harness.auth.betterAuth.options);

    expect(Object.keys(expected).sort()).toEqual(Object.keys(tableFor).sort());
    for (const [model, definition] of Object.entries(expected)) {
      const table = authTables[tableFor[model] ?? 'users'];
      const columns = getTableColumns(table);
      for (const [field, attributes] of Object.entries(definition.fields)) {
        const column = columns[(attributes.fieldName ?? field) as keyof typeof columns];
        expect(column, `${model}.${field}`).toBeDefined();
        if (attributes.required !== false && column !== undefined) {
          expect(column.notNull, `${model}.${field} is required`).toBe(true);
        }
      }
    }
  });

  it('follow the data rules: plural snake_case, uuidv7 keys and UTC timestamps', () => {
    const sql = readFileSync(
      new URL('../test/drizzle/0000_create_auth_tables.sql', import.meta.url),
      'utf8'
    );

    expect(Object.values(authTables).map((table) => getTableName(table))).toEqual([
      'users',
      'sessions',
      'accounts',
      'passkeys',
      'two_factors',
      'verifications',
      'rate_limits',
    ]);
    for (const table of Object.values(authTables)) {
      const columns = getTableColumns(table);
      expect(Object.values(columns).map((column) => column.name)).toEqual(
        expect.arrayContaining(['id', 'created_at', 'updated_at'])
      );
    }
    expect(sql.match(/"id" uuid PRIMARY KEY DEFAULT uuidv7\(\) NOT NULL/g)).toHaveLength(7);
    expect(sql).not.toMatch(/timestamp(?! with time zone)/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX "accounts_provider_id_account_id_key"/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX "users_email_key"/);
    expect(sql).toMatch(/ON DELETE cascade/);
  });

  it('delete a user with everything that belongs to them', async () => {
    const [user] = await harness.query<{ id: string }>(
      "insert into users (name, email) values ('Gone', 'gone@example.com') returning id"
    );
    await harness.query(
      "insert into sessions (user_id, token, expires_at) values ($1, 'token', now() + interval '1 day')",
      [user?.id]
    );
    await harness.query(
      "insert into accounts (user_id, provider_id, account_id) values ($1, 'credential', $2)",
      [user?.id, user?.id]
    );

    await harness.query(
      "insert into passkeys (user_id, credential_id, public_key, counter, device_type, backed_up) values ($1, 'cred', 'key', 0, 'singleDevice', false)",
      [user?.id]
    );

    await harness.query(
      "insert into two_factors (user_id, secret, backup_codes) values ($1, 'secret', 'codes')",
      [user?.id]
    );

    await harness.query('delete from users where id = $1', [user?.id]);

    expect(await harness.query('select id from sessions')).toEqual([]);
    expect(await harness.query('select id from accounts')).toEqual([]);
    expect(await harness.query('select id from passkeys')).toEqual([]);
    expect(await harness.query('select id from two_factors')).toEqual([]);
  });
});
