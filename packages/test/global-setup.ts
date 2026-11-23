import pg from 'pg';
import { postgresGlobalSetup } from './src/postgres.ts';

export const setup = postgresGlobalSetup({
  prepare: async (url) => {
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      await client.query('CREATE TABLE notes (id integer PRIMARY KEY, body text NOT NULL)');
      await client.query("INSERT INTO notes (id, body) VALUES (1, 'from the template')");
    } finally {
      await client.end();
    }
  },
});
