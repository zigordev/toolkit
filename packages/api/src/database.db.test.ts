import { createLogger } from '@zigordev/otel';
import { useApp } from '@zigordev/test/app';
import { useTestDatabase } from '@zigordev/test/postgres';
import { and, sql } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { createApi } from './api.ts';
import { addDatabase, afterCursor, keysetOrder } from './database.ts';
import { decodeCursor, pageOf } from './pagination.ts';

const things = pgTable('things', {
  id: uuid().primaryKey().default(sql`uuidv7()`),
  name: text().notNull(),
  createdAt: timestamp({ withTimezone: true, precision: 3, mode: 'string' }).notNull().defaultNow(),
});

const database = useTestDatabase();

function logger() {
  return createLogger({ service: 'things-api', destination: { write: () => true } });
}

async function build(url: string) {
  const app = await createApi({
    service: 'things-api',
    logger: logger(),
    docs: { title: 'Things', description: 'Things', version: '1.0.0' },
  });
  const db = addDatabase(app, { url, schema: { things } });
  await app.ready();
  return { app, db };
}

const server = useApp(async () => (await build(database.url)).app);

describe('addDatabase', () => {
  it('decorates the app with a database it can query', async () => {
    await server.app.db.insert(things).values({ name: 'first' });

    const rows = await server.app.db.select({ name: things.name }).from(things);

    expect(rows).toEqual([{ name: 'first' }]);
  });

  it('adds the database to the health route as a required part', async () => {
    const response = await server.app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      service: 'things-api',
      components: { db: { status: 'up' } },
    });
  });

  it('answers 503 on the health route when the database cannot be reached', async () => {
    const { app } = await build('postgres://nobody:nothing@127.0.0.1:1/nothing');

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: 'error',
      components: { db: { status: 'down' } },
    });
    await app.close();
  });

  it('closes its connections when the app closes', async () => {
    const { app, db } = await build(database.url);
    await db.select().from(things);

    await app.close();

    await expect(db.select().from(things)).rejects.toThrow();
  });
});

describe('keyset paging', () => {
  it('walks every row once in both orders, also when the sorted values repeat', async () => {
    const { app, db } = await build(database.url);
    await db.delete(things);
    await db
      .insert(things)
      .values(Array.from({ length: 25 }, (_, index) => ({ name: `name ${index % 4}` })));

    for (const direction of ['asc', 'desc'] as const) {
      const sort = direction === 'asc' ? 'name' : '-name';
      const seen: { name: string; id: string }[] = [];
      let cursor: string | undefined;
      do {
        const after = cursor === undefined ? undefined : decodeCursor(cursor, sort, 2);
        const rows = await db
          .select({ id: things.id, name: things.name })
          .from(things)
          .where(and(afterCursor([things.name, things.id], direction, after)))
          .orderBy(...keysetOrder([things.name, things.id], direction))
          .limit(7 + 1);
        const page = pageOf(rows, 7, sort, (row) => [row.name, row.id]);
        seen.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor !== undefined);

      const expected = [...seen].sort((a, b) =>
        a.name === b.name ? a.id.localeCompare(b.id) : a.name.localeCompare(b.name)
      );
      expect(new Set(seen.map((row) => row.id)).size).toBe(25);
      expect(seen).toEqual(direction === 'asc' ? expected : expected.reverse());
    }
    await app.close();
  });

  it('gives no condition for the first page', () => {
    expect(afterCursor([things.name, things.id], 'asc', undefined)).toBeUndefined();
  });
});
