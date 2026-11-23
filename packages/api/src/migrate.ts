import type { Logger } from '@zigordev/otel';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

export interface MigrateOptions {
  readonly url: string;
  readonly adminUrl?: string;
  readonly folder: string;
  readonly logger: Logger;
}

export interface MigrateResult {
  readonly applied: number;
  readonly total: number;
}

const journal = 'drizzle.__drizzle_migrations';

async function withClient<T>(url: string, work: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

function target(url: string): { role: string; password: string; database: string } {
  const parsed = new URL(url);
  return {
    role: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.slice(1)),
  };
}

async function provide(adminUrl: string, url: string, logger: Logger): Promise<void> {
  const { role, password, database } = target(url);
  if (role === '' || password === '' || database === '') {
    throw new Error('The address of the database names no role, password or database');
  }
  await withClient(adminUrl, async (client) => {
    const name = client.escapeIdentifier(role);
    const secret = client.escapeLiteral(password);
    const roles = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
    if (roles.rowCount === 0) {
      await client.query(`CREATE ROLE ${name} LOGIN PASSWORD ${secret}`);
      logger.info({ event: 'migration.role_created', role });
    } else {
      await client.query(`ALTER ROLE ${name} LOGIN PASSWORD ${secret}`);
    }
    const databases = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      database,
    ]);
    if (databases.rowCount === 0) {
      await client.query(`CREATE DATABASE ${client.escapeIdentifier(database)} OWNER ${name}`);
      logger.info({ event: 'migration.database_created', database });
    }
    await client.query(`REVOKE ALL ON DATABASE ${client.escapeIdentifier(database)} FROM PUBLIC`);
  });
}

async function countApplied(client: pg.Client): Promise<number> {
  const found = await client.query<{ present: boolean }>(
    'SELECT to_regclass($1) IS NOT NULL AS present',
    [journal]
  );
  if (found.rows[0]?.present !== true) {
    return 0;
  }
  const counted = await client.query<{ count: string }>(`SELECT count(*) AS count FROM ${journal}`);
  return Number(counted.rows[0]?.count ?? 0);
}

export async function migrateDatabase(options: MigrateOptions): Promise<MigrateResult> {
  const { logger } = options;
  logger.info({ event: 'migration.started' });
  try {
    if (options.adminUrl !== undefined) {
      await provide(options.adminUrl, options.url, logger);
    }
    const result = await withClient(options.url, async (client) => {
      const before = await countApplied(client);
      await migrate(drizzle({ client }), { migrationsFolder: options.folder });
      const total = await countApplied(client);
      return { applied: total - before, total };
    });
    logger.info({ event: 'migration.finished', ...result });
    return result;
  } catch (error) {
    logger.error({ event: 'migration.failed', error });
    throw error;
  }
}
