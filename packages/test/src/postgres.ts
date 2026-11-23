import { randomUUID } from 'node:crypto';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { afterAll, beforeAll, inject } from 'vitest';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    postgresTemplateUrl: string;
  }
}

export const postgresImage = 'postgres:18-alpine';

export interface StartPostgresOptions {
  readonly image?: string;
  readonly prepare?: (templateUrl: string) => Promise<void>;
}

export interface PostgresServer {
  readonly templateUrl: string;
  stop(): Promise<void>;
}

export interface TestDatabase {
  readonly url: string;
  drop(): Promise<void>;
}

const templateDatabase = 'app_template';

function identifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

export function databaseUrl(serverUrl: string, database: string): string {
  const url = new URL(serverUrl);
  url.pathname = `/${encodeURIComponent(database)}`;
  return url.toString();
}

function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.slice(1));
}

async function withClient<T>(url: string, work: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

export async function startPostgres(options: StartPostgresOptions = {}): Promise<PostgresServer> {
  const container = await new PostgreSqlContainer(options.image ?? postgresImage)
    .withDatabase(templateDatabase)
    .withCommand([
      'postgres',
      '-c',
      'fsync=off',
      '-c',
      'synchronous_commit=off',
      '-c',
      'full_page_writes=off',
    ])
    .start();
  const templateUrl = container.getConnectionUri();
  try {
    await options.prepare?.(templateUrl);
    await withClient(databaseUrl(templateUrl, 'postgres'), async (client) => {
      await client.query(
        `ALTER DATABASE ${identifier(templateDatabase)} WITH ALLOW_CONNECTIONS false`
      );
      await client.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
        [templateDatabase]
      );
    });
  } catch (error) {
    await container.stop();
    throw error;
  }
  return {
    templateUrl,
    stop: async () => {
      await container.stop();
    },
  };
}

export async function createTestDatabase(templateUrl: string): Promise<TestDatabase> {
  const name = `test_${randomUUID().replaceAll('-', '')}`;
  const maintenanceUrl = databaseUrl(templateUrl, 'postgres');
  await withClient(maintenanceUrl, (client) =>
    client.query(
      `CREATE DATABASE ${identifier(name)} TEMPLATE ${identifier(databaseName(templateUrl))}`
    )
  );
  return {
    url: databaseUrl(templateUrl, name),
    drop: async () => {
      await withClient(maintenanceUrl, (client) =>
        client.query(`DROP DATABASE IF EXISTS ${identifier(name)} WITH (FORCE)`)
      );
    },
  };
}

export function postgresGlobalSetup(
  options: StartPostgresOptions = {}
): (project: TestProject) => Promise<() => Promise<void>> {
  return async (project) => {
    const server = await startPostgres(options);
    project.provide('postgresTemplateUrl', server.templateUrl);
    return () => server.stop();
  };
}

export function useTestDatabase(): { readonly url: string } {
  let database: TestDatabase | undefined;
  beforeAll(async () => {
    database = await createTestDatabase(inject('postgresTemplateUrl'));
  });
  afterAll(async () => {
    await database?.drop();
  });
  return {
    get url(): string {
      if (database === undefined) {
        throw new Error(
          'useTestDatabase gives its database only to tests and hooks that run after its beforeAll'
        );
      }
      return database.url;
    },
  };
}
