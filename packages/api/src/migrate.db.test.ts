import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createLogger } from '@zigordev/otel';
import { captureLogs } from '@zigordev/test/app';
import { databaseUrl } from '@zigordev/test/postgres';
import pg from 'pg';
import { describe, expect, inject, it } from 'vitest';
import { migrateDatabase } from './migrate.ts';

const folder = fileURLToPath(new URL('../test/migrations', import.meta.url));
const broken = fileURLToPath(new URL('../test/broken', import.meta.url));
const templateUrl = inject('postgresTemplateUrl');
const adminUrl = databaseUrl(templateUrl, 'postgres');

function appUrl(role: string, password: string, database: string): string {
  const url = new URL(templateUrl);
  url.username = role;
  url.password = password;
  url.pathname = `/${database}`;
  return url.toString();
}

function fresh() {
  const name = `app_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  return { role: name, database: name, password: randomBytes(18).toString('base64url') };
}

async function query<T extends pg.QueryResultRow>(url: string, text: string): Promise<T[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query<T>(text)).rows;
  } finally {
    await client.end();
  }
}

function logged() {
  const logs = captureLogs();
  return { logs, logger: createLogger({ service: 'things-api-migrate', destination: logs }) };
}

describe('migrateDatabase', () => {
  it('makes the role and the database of the app, then applies every migration as that role', async () => {
    const app = fresh();
    const { logs, logger } = logged();
    const url = appUrl(app.role, app.password, app.database);

    const result = await migrateDatabase({ url, adminUrl, folder, logger });

    expect(result).toEqual({ applied: 2, total: 2 });
    expect(await query(url, 'SELECT name, colour FROM widgets')).toEqual([]);
    const [owner] = await query<{ owner: string }>(
      url,
      "SELECT tableowner AS owner FROM pg_tables WHERE tablename = 'widgets'"
    );
    expect(owner?.owner).toBe(app.role);
    expect(logs.events()).toEqual([
      'migration.started',
      'migration.role_created',
      'migration.database_created',
      'migration.finished',
    ]);
    expect(logs.find('migration.finished')[0]).toMatchObject({ applied: 2, total: 2 });
    expect(JSON.stringify(logs.lines)).not.toContain(app.password);
  });

  it('applies nothing the second time, and sets the password the address gives', async () => {
    const app = fresh();
    const { logger } = logged();
    await migrateDatabase({
      url: appUrl(app.role, app.password, app.database),
      adminUrl,
      folder,
      logger,
    });
    const rotated = randomBytes(18).toString('base64url');

    const again = await migrateDatabase({
      url: appUrl(app.role, rotated, app.database),
      adminUrl,
      folder,
      logger,
    });

    expect(again).toEqual({ applied: 0, total: 2 });
    await expect(query(appUrl(app.role, app.password, app.database), 'SELECT 1')).rejects.toThrow(
      /password authentication failed/
    );
  });

  it('migrates a database that exists already when it is given no admin address', async () => {
    const app = fresh();
    const { logs, logger } = logged();
    const admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE ROLE ${app.role} LOGIN PASSWORD '${app.password}'`);
    await admin.query(`CREATE DATABASE ${app.database} OWNER ${app.role}`);
    await admin.end();

    const result = await migrateDatabase({
      url: appUrl(app.role, app.password, app.database),
      folder,
      logger,
    });

    expect(result).toEqual({ applied: 2, total: 2 });
    expect(logs.events()).toEqual(['migration.started', 'migration.finished']);
  });

  it('stops, says so and gives the error back when a migration fails', async () => {
    const app = fresh();
    const { logs, logger } = logged();

    await expect(
      migrateDatabase({
        url: appUrl(app.role, app.password, app.database),
        adminUrl,
        folder: broken,
        logger,
      })
    ).rejects.toThrow(/no_such_type/);
    expect(logs.events().at(-1)).toBe('migration.failed');
    expect(logs.find('migration.failed')[0]).toMatchObject({ level: 'error' });
  });

  it('refuses an address without a password before it touches the server', async () => {
    const { logs, logger } = logged();

    await expect(
      migrateDatabase({ url: appUrl('someone', '', 'somewhere'), adminUrl, folder, logger })
    ).rejects.toThrow('names no role, password or database');
    expect(logs.events()).toEqual(['migration.started', 'migration.failed']);
  });
});
