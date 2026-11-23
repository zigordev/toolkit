import { describe, expect, it } from 'vitest';
import { databaseUrl, postgresImage } from './postgres.ts';

describe('databaseUrl', () => {
  it('names another database on the same server, with the same sign-in', () => {
    expect(databaseUrl('postgres://test:test@127.0.0.1:5432/app_template', 'postgres')).toBe(
      'postgres://test:test@127.0.0.1:5432/postgres'
    );
  });

  it('encodes a name that a URL cannot hold as it is', () => {
    expect(databaseUrl('postgres://test@db:5432/one', 'a b/c')).toBe(
      'postgres://test@db:5432/a%20b%2Fc'
    );
  });

  it('keeps the settings in the query', () => {
    expect(databaseUrl('postgres://db:5432/one?sslmode=disable', 'two')).toBe(
      'postgres://db:5432/two?sslmode=disable'
    );
  });
});

describe('postgresImage', () => {
  it('is PostgreSQL 18, the major version production runs', () => {
    expect(postgresImage).toMatch(/^postgres:18(-|$)/);
  });
});
