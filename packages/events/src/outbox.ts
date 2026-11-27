import { type Counter, type Span, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Producer } from '@platformatic/kafka';
import type { Logger } from '@zigordev/otel';
import { asc, inArray } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as z from 'zod';
import { createEnvelope, type DataOf, type EventDefinition, type EventOf } from './event.ts';
import { eventsOutbox } from './tables.ts';
import {
  activeTraceHeaders,
  carriesTrace,
  contextFromHeaders,
  instrumentationName,
  sendAttributes,
} from './telemetry.ts';

export type Database = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;

export type EventProducer = Producer<string, Buffer, string, string>;

export interface OutboxMessage<Definition extends EventDefinition> {
  readonly topic: string;
  readonly event: Definition;
  readonly data: DataOf<Definition>;
  readonly key?: string;
  readonly id?: string;
}

const eventIdSchema = z.uuid();

export async function addToOutbox<Definition extends EventDefinition>(
  db: Database,
  message: OutboxMessage<Definition>
): Promise<EventOf<Definition>> {
  const envelope = createEnvelope(
    message.event,
    message.data,
    message.id === undefined ? {} : { id: eventIdSchema.parse(message.id) }
  );
  await db.insert(eventsOutbox).values({
    topic: message.topic,
    key: message.key ?? envelope.id,
    value: envelope,
    headers: activeTraceHeaders(),
  });
  return envelope;
}

export function errorType(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const { code, name } = error as { code?: unknown; name?: unknown };
    if (typeof code === 'string' && code !== '') {
      return code;
    }
    if (typeof name === 'string' && name !== '') {
      return name;
    }
  }
  return '_OTHER';
}

interface OutboxRow {
  readonly id: number;
  readonly topic: string;
  readonly key: string;
  readonly value: unknown;
  readonly headers: Record<string, string>;
}

interface Outgoing {
  readonly row: OutboxRow;
  readonly span: Span | undefined;
  readonly headers: Record<string, string>;
}

function eventId(value: unknown): string | undefined {
  const id = (value as { id?: unknown } | null)?.id;
  return typeof id === 'string' ? id : undefined;
}

function prepare(row: OutboxRow): Outgoing {
  const parent = contextFromHeaders(row.headers);
  if (!carriesTrace(parent)) {
    return { row, span: undefined, headers: {} };
  }
  const id = eventId(row.value);
  const span = trace.getTracer(instrumentationName).startSpan(
    `send ${row.topic}`,
    {
      kind: SpanKind.PRODUCER,
      attributes: {
        ...sendAttributes(row.topic),
        ...(id === undefined ? {} : { 'messaging.message.id': id }),
      },
    },
    parent
  );
  return { row, span, headers: activeTraceHeaders(trace.setSpan(parent, span)) };
}

export async function sendRows(
  producer: EventProducer,
  sent: Counter,
  rows: readonly OutboxRow[]
): Promise<void> {
  const outgoing = rows.map(prepare);
  try {
    await producer.send({
      messages: outgoing.map(({ row, headers }) => ({
        topic: row.topic,
        key: row.key,
        value: Buffer.from(JSON.stringify(row.value)),
        headers,
      })),
    });
  } catch (error) {
    const type = errorType(error);
    for (const { row, span } of outgoing) {
      sent.add(1, { ...sendAttributes(row.topic), 'error.type': type });
      span?.setStatus({ code: SpanStatusCode.ERROR, message: type });
      span?.end();
    }
    throw error;
  }
  for (const { row, span } of outgoing) {
    sent.add(1, sendAttributes(row.topic));
    span?.end();
  }
}

export interface OutboxRelayOptions {
  readonly db: Database;
  readonly producer: EventProducer;
  readonly sent: Counter;
  readonly logger: Logger;
  readonly interval?: number;
  readonly batchSize?: number;
  readonly maxPause?: number;
}

export interface OutboxRelay {
  flush(): Promise<number>;
  stop(): Promise<void>;
}

export function startOutboxRelay(options: OutboxRelayOptions): OutboxRelay {
  const interval = options.interval ?? 1_000;
  const batchSize = options.batchSize ?? 100;
  const maxPause = options.maxPause ?? 30_000;
  let stopped = false;
  let wake: (() => void) | undefined;

  const passOnce = (): Promise<number> =>
    options.db.transaction(async (tx) => {
      const rows = await tx
        .select({
          id: eventsOutbox.id,
          topic: eventsOutbox.topic,
          key: eventsOutbox.key,
          value: eventsOutbox.value,
          headers: eventsOutbox.headers,
        })
        .from(eventsOutbox)
        .orderBy(asc(eventsOutbox.id))
        .limit(batchSize)
        .for('update', { skipLocked: true });
      if (rows.length === 0) {
        return 0;
      }
      await sendRows(options.producer, options.sent, rows);
      await tx.delete(eventsOutbox).where(
        inArray(
          eventsOutbox.id,
          rows.map((row) => row.id)
        )
      );
      return rows.length;
    });

  let previous: Promise<unknown> = Promise.resolve();
  const relayOnce = (): Promise<number> => {
    const pass = previous.then(passOnce, passOnce);
    previous = pass.catch(() => undefined);
    return pass;
  };

  const pause = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      const timer = setTimeout(done, ms);
      function done(): void {
        clearTimeout(timer);
        wake = undefined;
        resolve();
      }
      wake = done;
    });

  const running = (async () => {
    let failures = 0;
    while (!stopped) {
      let sent = 0;
      try {
        sent = await relayOnce();
        failures = 0;
      } catch (error) {
        failures += 1;
        options.logger.warn({ event: 'events.relay_failed', attempt: failures, error });
      }
      if (stopped) {
        break;
      }
      if (failures > 0) {
        await pause(Math.min(interval * 2 ** (failures - 1), maxPause));
      } else if (sent < batchSize) {
        await pause(interval);
      }
    }
  })();

  return {
    flush: async () => {
      let total = 0;
      for (;;) {
        const sent = await relayOnce();
        total += sent;
        if (sent === 0) {
          return total;
        }
      }
    },
    stop: async () => {
      stopped = true;
      wake?.();
      await running;
    },
  };
}
