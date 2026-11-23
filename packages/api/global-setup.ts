import { postgresGlobalSetup } from '@zigordev/test/postgres';
import pg from 'pg';

export const setup = postgresGlobalSetup({
  prepare: async (url) => {
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      await client.query(
        'CREATE TABLE things (id uuid PRIMARY KEY DEFAULT uuidv7(), name text NOT NULL, created_at timestamp (3) with time zone NOT NULL DEFAULT now())'
      );
    } finally {
      await client.end();
    }
  },
});
