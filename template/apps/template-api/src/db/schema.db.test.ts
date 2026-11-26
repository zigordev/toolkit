import { keysetOrder } from '@zigordev/api';
import { useTestDatabase } from '@zigordev/test/postgres';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { notes } from './schema.ts';

const database = useTestDatabase();

describe('the notes table', () => {
  it('serves the default order of the list, newest first, from its index', async () => {
    const client = new pg.Client({ connectionString: database.url });
    await client.connect();
    try {
      const query = drizzle({ client, casing: 'snake_case' })
        .select()
        .from(notes)
        .orderBy(...keysetOrder([notes.createdAt, notes.id], 'desc'))
        .limit(21)
        .toSQL();
      await client.query('SET enable_seqscan = off');

      const { rows } = await client.query<{ 'QUERY PLAN': string }>(
        `EXPLAIN ${query.sql}`,
        query.params
      );

      const plan = rows.map((row) => row['QUERY PLAN']).join('\n');
      expect(plan).toContain('Index Scan Backward using notes_created_at_id_idx on notes');
      expect(plan).not.toContain('Sort');
    } finally {
      await client.end();
    }
  });

  it("serves a person's list, newest first, from the owner's index", async () => {
    const client = new pg.Client({ connectionString: database.url });
    await client.connect();
    try {
      const query = drizzle({ client, casing: 'snake_case' })
        .select()
        .from(notes)
        .where(eq(notes.ownerId, '0190d4c2-0000-7000-8000-000000000001'))
        .orderBy(...keysetOrder([notes.createdAt, notes.id], 'desc'))
        .limit(21)
        .toSQL();
      await client.query('SET enable_seqscan = off');
      await client.query('SET enable_bitmapscan = off');

      const { rows } = await client.query<{ 'QUERY PLAN': string }>(
        `EXPLAIN ${query.sql}`,
        query.params
      );

      const plan = rows.map((row) => row['QUERY PLAN']).join('\n');
      expect(plan).toContain('Index Scan Backward using notes_owner_id_created_at_id_idx on notes');
      expect(plan).not.toContain('Sort');
    } finally {
      await client.end();
    }
  });

  it("deletes a person's notes with the person, and keeps the notes of nobody", async () => {
    const client = new pg.Client({ connectionString: database.url });
    await client.connect();
    try {
      const { rows } = await client.query<{ id: string }>(
        "INSERT INTO users (name, email) VALUES ('Ada', 'ada.schema@example.com') RETURNING id"
      );
      const owner = rows[0]?.id;
      await client.query(
        "INSERT INTO notes (title, owner_id) VALUES ('Hers', $1), ('Nobody''s', NULL)",
        [owner]
      );

      await client.query('DELETE FROM users WHERE id = $1', [owner]);

      const left = await client.query<{ title: string }>(
        "SELECT title FROM notes WHERE title IN ('Hers', 'Nobody''s')"
      );
      expect(left.rows.map((row) => row.title)).toEqual(["Nobody's"]);
    } finally {
      await client.end();
    }
  });

  it('refuses a status it does not know', async () => {
    const client = new pg.Client({ connectionString: database.url });
    await client.connect();
    try {
      await expect(
        client.query("INSERT INTO notes (title, status) VALUES ('x', 'later')")
      ).rejects.toThrow(/notes_status_known/);
    } finally {
      await client.end();
    }
  });
});
