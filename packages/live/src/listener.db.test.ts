import { createLogger } from '@zigordev/otel';
import { captureLogs } from '@zigordev/test/app';
import { useTestDatabase } from '@zigordev/test/postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { LiveNotice } from './index.ts';
import { type LiveHandlers, type LiveListener, pgListener } from './listener.ts';
import { notifyChange } from './server.ts';

const database = useTestDatabase();
const fast = { firstMs: 50, maxMs: 200 };
const logs = captureLogs();
const logger = createLogger({ service: 'live-test', level: 'info', destination: logs });

let pool: pg.Pool;
let listener: LiveListener | undefined;

beforeAll(() => {
  pool = new pg.Pool({ connectionString: database.url, max: 2 });
});

afterAll(async () => {
  await pool.end();
});

afterEach(async () => {
  await listener?.stop();
  listener = undefined;
  logs.clear();
});

interface Heard {
  readonly notices: LiveNotice[];
  reconnects: number;
  readonly handlers: LiveHandlers;
}

function heard(): Heard {
  const result: Heard = {
    notices: [],
    reconnects: 0,
    handlers: {
      notice: (notice) => {
        result.notices.push(notice);
      },
      reconnected: () => {
        result.reconnects += 1;
      },
    },
  };
  return result;
}

async function listen(url = database.url): Promise<{ listener: LiveListener; heard: Heard }> {
  const current = pgListener({ url, logger, backoff: fast, connectTimeoutMs: 1_000 });
  listener = current;
  const result = heard();
  await current.start(result.handlers);
  return { listener: current, heard: result };
}

async function liveConnections(): Promise<number> {
  const result = await pool.query<{ count: string }>(
    "select count(*) from pg_stat_activity where application_name = 'zigordev-live'"
  );
  return Number(result.rows[0]?.count ?? 0);
}

const note = (id: string): LiveNotice => ({ channel: 'notes:u1', type: 'note.updated', id });

describe('pgListener', () => {
  it('listens on its own connection once started, and lets it go when stopped', async () => {
    const { listener: current } = await listen();

    expect(current.listening()).toBe(true);
    expect(await liveConnections()).toBe(1);
    expect(logs.events()).toContain('live.listening');

    await current.stop();

    expect(current.listening()).toBe(false);
    await vi.waitFor(async () => expect(await liveConnections()).toBe(0));
  });

  it('hears a change once the transaction that made it commits', async () => {
    const { heard: result } = await listen();
    const db = drizzle({ client: pool });

    await db.transaction(async (tx) => {
      await notifyChange(tx, note('n1'));
      expect(result.notices).toEqual([]);
    });

    await vi.waitFor(() => expect(result.notices).toEqual([note('n1')]));
  });

  it('hears nothing from a transaction that rolls back', async () => {
    const { heard: result } = await listen();
    const db = drizzle({ client: pool });

    await expect(
      db.transaction(async (tx) => {
        await notifyChange(tx, note('lost'));
        tx.rollback();
      })
    ).rejects.toThrow();
    await db.transaction(async (tx) => {
      await notifyChange(tx, note('kept'));
    });

    await vi.waitFor(() => expect(result.notices).toEqual([note('kept')]));
  });

  it('skips a notice it cannot read, and says so in the log', async () => {
    const { heard: result } = await listen();

    await pool.query("select pg_notify('zigordev_live', 'not json')");
    await pool.query("select pg_notify('zigordev_live', $1)", [JSON.stringify(note('n2'))]);

    await vi.waitFor(() => expect(result.notices).toEqual([note('n2')]));
    expect(logs.events()).toContain('live.notice_invalid');
  });

  it('connects again after its connection is cut, and asks for a resync', async () => {
    const { listener: current, heard: result } = await listen();

    await pool.query(
      "select pg_terminate_backend(pid) from pg_stat_activity where application_name = 'zigordev-live'"
    );

    await vi.waitFor(() => expect(result.reconnects).toBe(1));
    expect(current.listening()).toBe(true);
    expect(logs.find('live.listen_failed')[0]).toMatchObject({ level: 'warn', retryInMs: 50 });
    await pool.query("select pg_notify('zigordev_live', $1)", [JSON.stringify(note('n3'))]);
    await vi.waitFor(() => expect(result.notices).toEqual([note('n3')]));
  });

  it('keeps trying, with growing pauses, while the database cannot be reached', async () => {
    const unreachable = 'postgres://live:live@127.0.0.1:1/live';
    const { listener: current, heard: result } = await listen(unreachable);

    expect(current.listening()).toBe(false);
    await vi.waitFor(() =>
      expect(logs.find('live.listen_failed').length).toBeGreaterThanOrEqual(3)
    );
    const pauses = logs.find('live.listen_failed').map((line) => line.retryInMs);
    expect(pauses.slice(0, 3)).toEqual([50, 100, 200]);

    await current.stop();
    const attempts = logs.find('live.listen_failed').length;
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(logs.find('live.listen_failed')).toHaveLength(attempts);
    expect(result.reconnects).toBe(0);
  });
});
