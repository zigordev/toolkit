import { type AnyColumn, type SQL, sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { addHealthComponent } from './health.ts';
import type { CursorValue, SortDirection } from './pagination.ts';

declare module 'fastify' {
  interface FastifyInstance {
    db: NodePgDatabase<Record<string, unknown>>;
  }
}

export interface DatabaseOptions<S extends Record<string, unknown>> {
  readonly url: string;
  readonly schema?: S;
  readonly poolSize?: number;
}

export function addDatabase<S extends Record<string, unknown> = Record<string, never>>(
  app: FastifyInstance,
  options: DatabaseOptions<S>
): NodePgDatabase<S> {
  const pool = new pg.Pool({ connectionString: options.url, max: options.poolSize ?? 10 });
  pool.on('error', (error) => {
    app.log.error({ event: 'database.client_failed', error });
  });
  const db = drizzle({
    client: pool,
    casing: 'snake_case',
    ...(options.schema === undefined ? {} : { schema: options.schema }),
  });
  app.decorate('db', db as unknown as NodePgDatabase<Record<string, unknown>>);
  addHealthComponent(app, {
    name: 'db',
    required: true,
    check: async () => {
      await pool.query('SELECT 1');
      return 'up' as const;
    },
  });
  app.addHook('onClose', async () => {
    await pool.end();
  });
  return db as NodePgDatabase<S>;
}

export function afterCursor(
  columns: readonly [AnyColumn, AnyColumn],
  direction: SortDirection,
  values: readonly CursorValue[] | undefined
): SQL | undefined {
  if (values === undefined) {
    return undefined;
  }
  const [sorted, id] = columns;
  const comparison = direction === 'asc' ? sql.raw('>') : sql.raw('<');
  return sql`(${sorted}, ${id}) ${comparison} (${values[0]}, ${values[1]})`;
}

export function keysetOrder(
  columns: readonly [AnyColumn, AnyColumn],
  direction: SortDirection
): SQL[] {
  const order = direction === 'asc' ? sql.raw('asc') : sql.raw('desc');
  return columns.map((column) => sql`${column} ${order}`);
}
