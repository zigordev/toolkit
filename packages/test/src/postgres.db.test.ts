import pg from 'pg';
import { describe, expect, inject, it } from 'vitest';
import {
  createTestDatabase,
  databaseUrl,
  postgresGlobalSetup,
  startPostgres,
  type TestDatabase,
  useTestDatabase,
} from './postgres.ts';

async function query<T extends pg.QueryResultRow>(
  url: string,
  text: string,
  values: unknown[] = []
): Promise<T[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query<T>(text, values)).rows;
  } finally {
    await client.end();
  }
}

const database = useTestDatabase();

describe('useTestDatabase', () => {
  const early = useTestDatabase();
  let message = '';
  try {
    void early.url;
  } catch (error) {
    message = (error as Error).message;
  }

  it('refuses to give its database before its beforeAll has run', () => {
    expect(message).toMatch(/only to tests and hooks that run after its beforeAll/);
  });

  it('gives the file a database copied from the prepared template', async () => {
    const rows = await query<{ body: string }>(database.url, 'SELECT body FROM notes');

    expect(rows).toEqual([{ body: 'from the template' }]);
  });

  it('runs PostgreSQL 18', async () => {
    const [row] = await query<{ server_version_num: string }>(
      database.url,
      'SHOW server_version_num'
    );

    expect(Number(row?.server_version_num)).toBeGreaterThanOrEqual(180000);
    expect(Number(row?.server_version_num)).toBeLessThan(190000);
  });

  it('keeps what a test writes for the next test of the same file', async () => {
    await query(database.url, "INSERT INTO notes (id, body) VALUES (2, 'from a test')");

    const rows = await query<{ id: number }>(database.url, 'SELECT id FROM notes ORDER BY id');

    expect(rows).toEqual([{ id: 1 }, { id: 2 }]);
  });
});

describe('createTestDatabase', () => {
  const templateUrl = inject('postgresTemplateUrl');

  it('makes copies that never see each other', async () => {
    const first = await createTestDatabase(templateUrl);
    const second = await createTestDatabase(templateUrl);
    try {
      await query(first.url, "INSERT INTO notes (id, body) VALUES (3, 'only in the first')");

      const seen = await query<{ id: number }>(second.url, 'SELECT id FROM notes ORDER BY id');

      expect(first.url).not.toBe(second.url);
      expect(seen).toEqual([{ id: 1 }]);
    } finally {
      await first.drop();
      await second.drop();
    }
  });

  it('drops the copy, even while a client still holds it', async () => {
    const copy: TestDatabase = await createTestDatabase(templateUrl);
    const holder = new pg.Client({ connectionString: copy.url });
    holder.on('error', () => undefined);
    await holder.connect();

    await copy.drop();

    const names = await query<{ datname: string }>(
      databaseUrl(templateUrl, 'postgres'),
      'SELECT datname FROM pg_database WHERE datname = $1',
      [new URL(copy.url).pathname.slice(1)]
    );
    expect(names).toEqual([]);
    await holder.end().catch(() => undefined);
  });

  it('copies many at once', async () => {
    const copies = await Promise.all(
      Array.from({ length: 5 }, () => createTestDatabase(templateUrl))
    );

    expect(new Set(copies.map((copy) => copy.url)).size).toBe(5);
    await Promise.all(copies.map((copy) => copy.drop()));
  });

  it('leaves the template closed to clients', async () => {
    await expect(query(templateUrl, 'SELECT 1')).rejects.toThrow(
      /not currently accepting connections/
    );
  });
});

describe('postgresGlobalSetup', () => {
  it('provides the template to the project, and stops the server at teardown', async () => {
    const provided = new Map<string, unknown>();
    const project = { provide: (key: string, value: unknown) => provided.set(key, value) };
    const setup = postgresGlobalSetup({
      prepare: async (url) => {
        await query(url, 'CREATE TABLE marks (id integer PRIMARY KEY)');
      },
    });

    const teardown = await setup(project as unknown as Parameters<typeof setup>[0]);
    const templateUrl = String(provided.get('postgresTemplateUrl'));
    const copy = await createTestDatabase(templateUrl);
    expect(await query(copy.url, 'SELECT id FROM marks')).toEqual([]);
    await teardown();

    await expect(query(copy.url, 'SELECT 1')).rejects.toThrow();
  });
});

describe('startPostgres', () => {
  it('closes what prepare left open, so copies never wait on it', async () => {
    let leftOpen: pg.Client | undefined;
    const server = await startPostgres({
      prepare: async (url) => {
        leftOpen = new pg.Client({ connectionString: url });
        leftOpen.on('error', () => undefined);
        await leftOpen.connect();
        await leftOpen.query('CREATE TABLE things (id integer PRIMARY KEY)');
      },
    });
    try {
      const copy = await createTestDatabase(server.templateUrl);

      expect(await query(copy.url, 'SELECT id FROM things')).toEqual([]);
      await copy.drop();
    } finally {
      await leftOpen?.end().catch(() => undefined);
      await server.stop();
    }
  });

  it('stops its container and rethrows when prepare fails', async () => {
    let templateUrl = '';
    const failure = new Error('the migration failed');

    await expect(
      startPostgres({
        prepare: async (url) => {
          templateUrl = url;
          throw failure;
        },
      })
    ).rejects.toBe(failure);

    await expect(query(templateUrl, 'SELECT 1')).rejects.toThrow();
  });
});
