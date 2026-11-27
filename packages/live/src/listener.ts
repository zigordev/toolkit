import type { Logger } from '@zigordev/otel';
import pg from 'pg';
import { type LiveNotice, liveChannel, parseNotice } from './index.ts';

export interface LiveHandlers {
  readonly notice: (notice: LiveNotice) => void;
  readonly reconnected: () => void;
}

export interface LiveListener {
  readonly start: (handlers: LiveHandlers) => Promise<void>;
  readonly stop: () => Promise<void>;
  readonly listening: () => boolean;
}

export interface Backoff {
  readonly firstMs: number;
  readonly maxMs: number;
}

export interface PgListenerOptions {
  readonly url: string;
  readonly logger: Logger;
  readonly backoff?: Backoff;
  readonly connectTimeoutMs?: number;
}

export const defaultBackoff: Backoff = { firstMs: 1_000, maxMs: 30_000 };

export function retryDelay(backoff: Backoff, attempt: number): number {
  return Math.min(backoff.maxMs, backoff.firstMs * 2 ** attempt);
}

export function pgListener(options: PgListenerOptions): LiveListener {
  const backoff = options.backoff ?? defaultBackoff;
  let handlers: LiveHandlers | undefined;
  let client: pg.Client | undefined;
  let listening = false;
  let lost = false;
  let stopped = false;
  let attempt = 0;
  let timer: NodeJS.Timeout | undefined;

  function retry(failed: pg.Client, error?: unknown): void {
    if (stopped || client !== failed || timer !== undefined) {
      return;
    }
    listening = false;
    lost = true;
    failed.end().catch(() => undefined);
    const retryInMs = retryDelay(backoff, attempt);
    attempt += 1;
    options.logger.warn({ event: 'live.listen_failed', error, retryInMs });
    timer = setTimeout(() => {
      timer = undefined;
      void connect();
    }, retryInMs);
    timer.unref();
  }

  async function connect(): Promise<void> {
    if (stopped) {
      return;
    }
    const next = new pg.Client({
      connectionString: options.url,
      application_name: 'zigordev-live',
      connectionTimeoutMillis: options.connectTimeoutMs ?? 5_000,
      keepAlive: true,
    });
    client = next;
    next.on('notification', (message) => {
      if (message.channel !== liveChannel || message.payload === undefined) {
        return;
      }
      const notice = parseNotice(message.payload);
      if (notice === undefined) {
        options.logger.warn({ event: 'live.notice_invalid' });
        return;
      }
      handlers?.notice(notice);
    });
    next.on('error', (error) => {
      retry(next, error);
    });
    next.on('end', () => {
      retry(next);
    });
    try {
      await next.connect();
      await next.query(`LISTEN ${liveChannel}`);
    } catch (error) {
      retry(next, error);
      return;
    }
    if (stopped || client !== next) {
      return;
    }
    listening = true;
    attempt = 0;
    options.logger.info({ event: 'live.listening' });
    if (lost) {
      lost = false;
      handlers?.reconnected();
    }
  }

  return {
    start: async (given) => {
      handlers = given;
      await connect();
    },
    stop: async () => {
      stopped = true;
      listening = false;
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      await client?.end().catch(() => undefined);
    },
    listening: () => listening,
  };
}
