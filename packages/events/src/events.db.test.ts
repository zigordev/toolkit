import { type AddressInfo, createServer } from 'node:net';
import { context, metrics, propagation, SpanKind, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { MeterProvider, MetricReader } from '@opentelemetry/sdk-metrics';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import {
  Admin,
  Consumer,
  type Message,
  MessagesStreamModes,
  stringDeserializer,
} from '@platformatic/kafka';
import { createLogger } from '@zigordev/otel';
import { captureLogs } from '@zigordev/test/app';
import { uniqueTopic, useKafka } from '@zigordev/test/kafka';
import { useTestDatabase } from '@zigordev/test/postgres';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as z from 'zod';
import { deadLetterTopicOf, defineConsumer } from './consumer.ts';
import { defineEvent, type EventsOf } from './event.ts';
import { createProducer, type Events, startEvents } from './events.ts';
import { addToOutbox, type Database } from './outbox.ts';
import { clientOptions, type KafkaConnection } from './settings.ts';
import { eventsOutbox, handledEvents } from './tables.ts';
import { createTopics } from './testing.ts';

const kafka = useKafka();
const database = useTestDatabase();

class TestReader extends MetricReader {
  protected override async onShutdown(): Promise<void> {}
  protected override async onForceFlush(): Promise<void> {}
}

interface Point {
  readonly attributes: Record<string, unknown>;
  readonly value: unknown;
}

interface TestTelemetry {
  readonly spans: InMemorySpanExporter;
  points(name: string): Promise<Point[]>;
}

function useTelemetry(): TestTelemetry {
  const spans = new InMemorySpanExporter();
  const reader = new TestReader();
  const tracerProvider = new TracerProvider({
    spanProcessors: [new SimpleSpanProcessor({ exporter: spans })],
  });
  const meterProvider = new MeterProvider({ readers: [reader] });
  beforeAll(() => {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
    propagation.setGlobalPropagator(new W3CTraceContextPropagator());
    trace.setGlobalTracerProvider(tracerProvider);
    metrics.setGlobalMeterProvider(meterProvider);
  });
  afterAll(async () => {
    await tracerProvider.shutdown();
    await meterProvider.shutdown();
    trace.disable();
    metrics.disable();
    propagation.disable();
    context.disable();
  });
  return {
    spans,
    points: async (name) => {
      const { resourceMetrics } = await reader.collect();
      const metric = resourceMetrics.scopeMetrics
        .flatMap((scope) => scope.metrics)
        .find((candidate) => candidate.descriptor.name === name);
      return (metric?.dataPoints ?? []).map((point) => ({
        attributes: { ...point.attributes },
        value: point.value,
      }));
    },
  };
}

const telemetry = useTelemetry();

const noteCreated = defineEvent({
  type: 'note.created',
  version: 1,
  schema: z.object({ noteId: z.uuid(), title: z.string().min(1) }),
});

type NoteEvent = EventsOf<readonly [typeof noteCreated]>;

const logs = captureLogs();
const logger = createLogger({ service: 'events-test', level: 'debug', destination: logs });

let pool: pg.Pool;
let db: Database;

beforeAll(() => {
  pool = new pg.Pool({ connectionString: database.url, max: 5 });
  db = drizzle({ client: pool, casing: 'snake_case' }) as unknown as Database;
});

afterAll(async () => {
  await pool.end();
});

function connection(overrides: Partial<KafkaConnection> = {}): KafkaConnection {
  return {
    clientId: 'events-test',
    brokers: kafka.brokers,
    username: kafka.username,
    password: kafka.password,
    ...overrides,
  };
}

async function existingTopics(): Promise<string[]> {
  const admin = new Admin(clientOptions(connection()));
  try {
    return await admin.listTopics();
  } finally {
    await admin.close();
  }
}

async function freshTopic(prefix: string): Promise<string> {
  const topic = uniqueTopic(prefix);
  await createTopics(connection(), [topic, deadLetterTopicOf(topic)]);
  return topic;
}

async function waitFor(check: () => boolean | Promise<boolean>, timeout = 30_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!(await check())) {
    if (Date.now() > deadline) {
      throw new Error('The condition did not hold in time');
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function readFirst(topic: string): Promise<Message<string, Buffer, string, string>> {
  const consumer = new Consumer({
    ...clientOptions(connection()),
    groupId: uniqueTopic('reader'),
    deserializers: {
      key: stringDeserializer,
      headerKey: stringDeserializer,
      headerValue: stringDeserializer,
    },
  }) as unknown as Consumer<string, Buffer, string, string>;
  const stream = await consumer.consume({ topics: [topic], mode: MessagesStreamModes.EARLIEST });
  try {
    for await (const message of stream) {
      return message;
    }
    throw new Error(`${topic} ended without a message`);
  } finally {
    await consumer.close(true);
  }
}

function outboxRows(topic: string) {
  return db.select().from(eventsOutbox).where(eq(eventsOutbox.topic, topic));
}

function linesOf(event: string, topic: string) {
  return logs.find(event).filter((line) => line.topic === topic);
}

async function pointOf(name: string, topic: string, extra: Record<string, unknown> = {}) {
  const points = await telemetry.points(name);
  return points.find(
    (point) =>
      point.attributes['messaging.destination.name'] === topic &&
      Object.entries(extra).every(([key, value]) => point.attributes[key] === value)
  );
}

const noteId = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

async function withEvents<T>(
  options: Parameters<typeof startEvents>[0],
  work: (events: Events) => Promise<T>
): Promise<T> {
  const events = startEvents(options);
  try {
    return await work(events);
  } finally {
    await events.stop();
  }
}

describe('an event saved with a change', () => {
  it('reaches its consumer once, and leaves the outbox empty', async () => {
    const topic = await freshTopic('notes');
    const group = uniqueTopic('group');
    const received: NoteEvent[] = [];
    await withEvents(
      {
        connection: connection(),
        db,
        logger,
        relay: { interval: 50 },
        consumers: [
          defineConsumer({
            group,
            topics: [topic],
            events: [noteCreated],
            handle: async (event, { tx, topic: from, attempt }) => {
              await tx.execute(sql`select 1`);
              expect(from).toBe(topic);
              expect(attempt).toBe(1);
              received.push(event);
            },
          }),
        ],
      },
      async () => {
        const envelope = await db.transaction((tx) =>
          addToOutbox(tx, { topic, event: noteCreated, data: { noteId, title: 'Buy milk' } })
        );

        await waitFor(() => received.length === 1);
        expect(received).toEqual([envelope]);
        expect(await outboxRows(topic)).toEqual([]);
        expect((await pointOf('messaging.client.sent.messages', topic))?.value).toBe(1);
        await waitFor(
          async () => (await pointOf('messaging.client.consumed.messages', topic))?.value === 1
        );
        const handled = await db
          .select()
          .from(handledEvents)
          .where(eq(handledEvents.eventId, envelope.id));
        expect(handled.map((row) => row.consumer)).toEqual([group]);
      }
    );
  });

  it('is never sent when the change rolls back', async () => {
    const topic = await freshTopic('notes');

    await expect(
      db.transaction(async (tx) => {
        await addToOutbox(tx, { topic, event: noteCreated, data: { noteId, title: 'x' } });
        throw new Error('the change failed');
      })
    ).rejects.toThrow('the change failed');

    expect(await outboxRows(topic)).toEqual([]);
  });

  it('is keyed by its id unless a key is given', async () => {
    const topic = await freshTopic('notes');

    const envelope = await addToOutbox(db, {
      topic,
      event: noteCreated,
      data: { noteId, title: 'x' },
    });
    await addToOutbox(db, {
      topic,
      event: noteCreated,
      data: { noteId, title: 'y' },
      key: noteId,
    });

    expect((await outboxRows(topic)).map((row) => row.key)).toEqual([envelope.id, noteId]);
  });

  it('takes the id it is given, and refuses one that is not a UUID', async () => {
    const topic = await freshTopic('notes');
    const id = '3f2a9c1e-5b7d-8e4f-9a6b-1c2d3e4f5a6b';

    const envelope = await addToOutbox(db, {
      topic,
      event: noteCreated,
      data: { noteId, title: 'x' },
      id,
    });

    expect(envelope.id).toBe(id);
    expect((await outboxRows(topic)).map((row) => row.key)).toEqual([id]);
    await expect(
      addToOutbox(db, { topic, event: noteCreated, data: { noteId, title: 'y' }, id: 'note-1' })
    ).rejects.toThrow();
    expect(await outboxRows(topic)).toHaveLength(1);
  });
});

describe('the consumer', () => {
  it('skips an event it has already handled', async () => {
    const topic = await freshTopic('notes');
    const received: NoteEvent[] = [];
    await withEvents(
      {
        connection: connection(),
        db,
        logger,
        relay: { interval: 50 },
        consumers: [
          defineConsumer({
            group: uniqueTopic('group'),
            topics: [topic],
            events: [noteCreated],
            handle: async (event) => {
              received.push(event);
            },
          }),
        ],
      },
      async () => {
        const envelope = await addToOutbox(db, {
          topic,
          event: noteCreated,
          data: { noteId, title: 'twice' },
        });
        await db.insert(eventsOutbox).values({ topic, key: envelope.id, value: envelope });

        await waitFor(
          async () => (await pointOf('messaging.client.consumed.messages', topic))?.value === 2
        );
        expect(received).toEqual([envelope]);
        expect((await pointOf('zigordev.events.duplicates', topic))?.value).toBe(1);
      }
    );
  });

  it('tries a failed handling again, and keeps nothing of the failed attempt', async () => {
    const topic = await freshTopic('notes');
    let calls = 0;
    await withEvents(
      {
        connection: connection(),
        db,
        logger,
        relay: { interval: 50 },
        consumers: [
          defineConsumer({
            group: uniqueTopic('group'),
            topics: [topic],
            events: [noteCreated],
            retryDelays: [20],
            handle: async (_event, { attempt }) => {
              calls += 1;
              if (attempt === 1) {
                throw new Error('the database was busy');
              }
            },
          }),
        ],
      },
      async () => {
        await addToOutbox(db, { topic, event: noteCreated, data: { noteId, title: 'x' } });

        await waitFor(
          async () => (await pointOf('messaging.client.consumed.messages', topic))?.value === 1
        );
        expect(calls).toBe(2);
        expect((await pointOf('zigordev.events.retries', topic))?.value).toBe(1);
        expect(linesOf('events.handling_retried', topic)).toHaveLength(1);
        expect(linesOf('events.handling_retried', topic)[0]?.level).toBe('warn');
      }
    );
  });

  it('moves an event to the dead-letter topic once its retries run out', async () => {
    const topic = await freshTopic('notes');
    let calls = 0;
    await withEvents(
      {
        connection: connection(),
        db,
        logger,
        relay: { interval: 50 },
        consumers: [
          defineConsumer({
            group: uniqueTopic('group'),
            topics: [topic],
            events: [noteCreated],
            retryDelays: [20, 40],
            handle: async () => {
              calls += 1;
              throw new TypeError('ada@example.com could not be reached');
            },
          }),
        ],
      },
      async () => {
        const envelope = await addToOutbox(db, {
          topic,
          event: noteCreated,
          data: { noteId, title: 'x' },
        });

        const dead = await readFirst(deadLetterTopicOf(topic));

        expect(calls).toBe(3);
        expect(JSON.parse(dead.value.toString('utf8'))).toEqual(envelope);
        expect(dead.headers.get('dead-letter.reason')).toBe('failed');
        expect(dead.headers.get('dead-letter.detail')).toBe('TypeError');
        expect(dead.headers.get('dead-letter.topic')).toBe(topic);
        expect([...dead.headers.values()].join(' ')).not.toContain('ada@example.com');
        await waitFor(
          async () =>
            (
              await pointOf('zigordev.events.dead_letters', topic, {
                'zigordev.events.reason': 'failed',
              })
            )?.value === 1
        );
        expect((await pointOf('zigordev.events.retries', topic))?.value).toBe(2);
        expect(linesOf('events.dead_lettered', topic)[0]?.level).toBe('error');
        const handled = await db
          .select()
          .from(handledEvents)
          .where(eq(handledEvents.eventId, envelope.id));
        expect(handled).toEqual([]);
      }
    );
  });

  it('moves a message it cannot read to the dead-letter topic at once', async () => {
    const topic = await freshTopic('notes');
    let calls = 0;
    const producer = createProducer(connection());
    try {
      await withEvents(
        {
          connection: connection(),
          db,
          logger,
          relay: false,
          consumers: [
            defineConsumer({
              group: uniqueTopic('group'),
              topics: [topic],
              events: [noteCreated],
              handle: async () => {
                calls += 1;
              },
            }),
          ],
        },
        async () => {
          await producer.send({
            messages: [{ topic, key: 'k', value: Buffer.from('{not json') }],
          });

          const dead = await readFirst(deadLetterTopicOf(topic));

          expect(dead.value.toString('utf8')).toBe('{not json');
          expect(dead.headers.get('dead-letter.reason')).toBe('invalid');
          expect(dead.headers.get('dead-letter.detail')).toBe('not_json');
          expect(calls).toBe(0);
          await waitFor(() => linesOf('events.message_rejected', topic).length === 1);
          expect(linesOf('events.message_rejected', topic)[0]).toMatchObject({
            level: 'error',
            reason: 'not_json',
          });
        }
      );
    } finally {
      await producer.close();
    }
  });

  it('stops while it waits to try again, and gets the event back after a restart', async () => {
    const topic = await freshTopic('notes');
    const group = uniqueTopic('group');
    const failing = startEvents({
      connection: connection(),
      db,
      logger,
      relay: { interval: 50 },
      consumers: [
        defineConsumer({
          group,
          topics: [topic],
          events: [noteCreated],
          retryDelays: [60_000],
          handle: async () => {
            throw new Error('not yet');
          },
        }),
      ],
    });
    const envelope = await addToOutbox(db, {
      topic,
      event: noteCreated,
      data: { noteId, title: 'x' },
    });
    await waitFor(() => linesOf('events.handling_retried', topic).length === 1);

    const started = Date.now();
    await failing.stop();

    expect(Date.now() - started).toBeLessThan(10_000);
    const received: NoteEvent[] = [];
    await withEvents(
      {
        connection: connection(),
        db,
        logger,
        relay: false,
        consumers: [
          defineConsumer({
            group,
            topics: [topic],
            events: [noteCreated],
            handle: async (event) => {
              received.push(event);
            },
          }),
        ],
      },
      async () => {
        await waitFor(() => received.length === 1);
        expect(received).toEqual([envelope]);
      }
    );
  });

  it('starts again after Kafka refuses it, says so, and still stops at once', async () => {
    const topic = await freshTopic('notes');
    const group = uniqueTopic('group');
    const events = startEvents({
      connection: connection({ password: 'wrong' }),
      db,
      logger,
      relay: false,
      consumers: [
        defineConsumer({
          group,
          topics: [topic],
          events: [noteCreated],
          handle: async () => undefined,
        }),
      ],
    });
    try {
      await waitFor(
        () => logs.find('events.consumer_restarting').some((line) => line.group === group),
        60_000
      );
      await expect(events.health.check()).rejects.toThrow();
    } finally {
      const started = Date.now();
      await events.stop();
      expect(Date.now() - started).toBeLessThan(10_000);
    }
  });

  it('stops at once while it is still connecting to a broker that does not answer', async () => {
    const silent = createServer(() => undefined);
    await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve));
    const { port } = silent.address() as AddressInfo;
    const connections = (): Promise<number> =>
      new Promise((resolve, reject) =>
        silent.getConnections((error, count) => (error ? reject(error) : resolve(count)))
      );
    const events = startEvents({
      connection: connection({ brokers: [`127.0.0.1:${port}`] }),
      db,
      logger,
      relay: false,
      consumers: [
        defineConsumer({
          group: uniqueTopic('group'),
          topics: [uniqueTopic('notes')],
          events: [noteCreated],
          handle: async () => undefined,
        }),
      ],
    });
    try {
      await waitFor(async () => (await connections()) > 0);
    } finally {
      const started = Date.now();
      await events.stop();
      expect(Date.now() - started).toBeLessThan(2_000);
      silent.close();
    }
  });

  it('forgets handled events once they are older than it keeps them', async () => {
    const topic = await freshTopic('notes');
    const group = uniqueTopic('group');
    const received: NoteEvent[] = [];
    await withEvents(
      {
        connection: connection(),
        db,
        logger,
        relay: { interval: 50 },
        pruneInterval: 100,
        consumers: [
          defineConsumer({
            group,
            topics: [topic],
            events: [noteCreated],
            keepHandledFor: 1,
            handle: async (event) => {
              received.push(event);
            },
          }),
        ],
      },
      async () => {
        await addToOutbox(db, { topic, event: noteCreated, data: { noteId, title: 'x' } });
        await waitFor(() => received.length === 1);

        await waitFor(
          async () =>
            (await db.select().from(handledEvents).where(eq(handledEvents.consumer, group)))
              .length === 0
        );
      }
    );
  });

  it('reports how far it lags behind its topic', async () => {
    const topic = await freshTopic('notes');
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await withEvents(
      {
        connection: connection(),
        db,
        logger,
        relay: { interval: 50 },
        lagInterval: 100,
        consumers: [
          defineConsumer({
            group: uniqueTopic('group'),
            topics: [topic],
            events: [noteCreated],
            handle: async () => {
              await held;
            },
          }),
        ],
      },
      async () => {
        for (const title of ['a', 'b', 'c']) {
          await addToOutbox(db, { topic, event: noteCreated, data: { noteId, title } });
        }

        await waitFor(async () => {
          const lag = await pointOf('zigordev.events.consumer.lag', topic);
          return typeof lag?.value === 'number' && lag.value >= 2;
        });
        release();
        await waitFor(
          async () => (await pointOf('zigordev.events.consumer.lag', topic))?.value === 0
        );
      }
    );
  });
});

describe('the trace', () => {
  it('continues from the request that saved the event, through Kafka, to its handling', async () => {
    const topic = await freshTopic('notes');
    const group = uniqueTopic('group');
    const received: NoteEvent[] = [];
    await withEvents(
      {
        connection: connection(),
        db,
        logger,
        relay: { interval: 50 },
        consumers: [
          defineConsumer({
            group,
            topics: [topic],
            events: [noteCreated],
            handle: async (event) => {
              received.push(event);
            },
          }),
        ],
      },
      async () => {
        const envelope = await trace
          .getTracer('test')
          .startActiveSpan('POST /api/v1/notes', async (span) => {
            try {
              return await db.transaction((tx) =>
                addToOutbox(tx, {
                  topic,
                  event: noteCreated,
                  data: { noteId, title: 'traced' },
                  key: 'ada@example.com',
                })
              );
            } finally {
              span.end();
            }
          });
        await waitFor(() => received.length === 1);
        const finished = () => telemetry.spans.getFinishedSpans();
        await waitFor(() => finished().some((span) => span.name === `process ${topic}`));

        const request = finished().find((span) => span.name === 'POST /api/v1/notes');
        const send = finished().find((span) => span.name === `send ${topic}`);
        const handling = finished().find((span) => span.name === `process ${topic}`);
        expect(send?.kind).toBe(SpanKind.PRODUCER);
        expect(handling?.kind).toBe(SpanKind.CONSUMER);
        expect(send?.parentSpanContext?.spanId).toBe(request?.spanContext().spanId);
        expect(handling?.parentSpanContext?.spanId).toBe(send?.spanContext().spanId);
        expect(handling?.spanContext().traceId).toBe(request?.spanContext().traceId);
        expect(handling?.attributes).toMatchObject({
          'messaging.system': 'kafka',
          'messaging.operation.name': 'process',
          'messaging.destination.name': topic,
          'messaging.destination.partition.id': '0',
          'messaging.consumer.group.name': group,
          'messaging.message.id': envelope.id,
        });
        expect(JSON.stringify([send?.attributes, handling?.attributes])).not.toContain(
          'ada@example.com'
        );
      }
    );
  });

  it('starts no send span for an event saved outside a trace', async () => {
    const topic = await freshTopic('notes');
    const received: NoteEvent[] = [];
    await withEvents(
      {
        connection: connection(),
        db,
        logger,
        relay: { interval: 50 },
        consumers: [
          defineConsumer({
            group: uniqueTopic('group'),
            topics: [topic],
            events: [noteCreated],
            handle: async (event) => {
              received.push(event);
            },
          }),
        ],
      },
      async () => {
        await addToOutbox(db, { topic, event: noteCreated, data: { noteId, title: 'quiet' } });
        await waitFor(() => received.length === 1);
        const finished = () => telemetry.spans.getFinishedSpans();
        await waitFor(() => finished().some((span) => span.name === `process ${topic}`));

        expect(finished().some((span) => span.name === `send ${topic}`)).toBe(false);
        const handling = finished().find((span) => span.name === `process ${topic}`);
        expect(handling?.parentSpanContext).toBeUndefined();
      }
    );
  });
});

describe('the outbox', () => {
  it('reports how many events wait, and how long the oldest has waited', async () => {
    const topic = await freshTopic('notes');
    await withEvents(
      { connection: connection(), db, logger, relay: { interval: 60_000 } },
      async (events) => {
        await events.flush();
        await addToOutbox(db, { topic, event: noteCreated, data: { noteId, title: 'a' } });
        await addToOutbox(db, { topic, event: noteCreated, data: { noteId, title: 'b' } });

        const waiting = await telemetry.points('zigordev.events.outbox.backlog');
        const age = await telemetry.points('zigordev.events.outbox.oldest_age');
        expect(waiting[0]?.value).toBe(2);
        expect(age[0]?.value).toBeGreaterThanOrEqual(0);

        expect(await events.flush()).toBe(2);
        expect((await telemetry.points('zigordev.events.outbox.backlog'))[0]?.value).toBe(0);
      }
    );
  });

  it('keeps an event that it could not send, and says so', async () => {
    const topic = uniqueTopic('notes');
    await withEvents(
      {
        connection: connection({ brokers: ['127.0.0.1:1'] }),
        db,
        logger,
        relay: { interval: 50 },
      },
      async () => {
        await addToOutbox(db, { topic, event: noteCreated, data: { noteId, title: 'x' } });

        await waitFor(() => logs.find('events.relay_failed').length > 0);

        expect(await outboxRows(topic)).toHaveLength(1);
        await db.delete(eventsOutbox).where(eq(eventsOutbox.topic, topic));
      }
    );
  });
});

describe('the health component', () => {
  it('is up while it reaches Kafka and its consumers run', async () => {
    const topic = await freshTopic('notes');
    await withEvents(
      {
        connection: connection(),
        db,
        logger,
        relay: false,
        consumers: [
          defineConsumer({
            group: uniqueTopic('group'),
            topics: [topic],
            events: [noteCreated],
            handle: async () => undefined,
          }),
        ],
      },
      async (events) => {
        expect(events.health).toMatchObject({ name: 'kafka', required: false });
        await waitFor(async () => (await events.health.check()) === 'up');
      }
    );
  });

  it('fails when Kafka refuses the password', async () => {
    await withEvents(
      { connection: connection({ password: 'wrong' }), db, logger, relay: false },
      async (events) => {
        await expect(events.health.check()).rejects.toThrow();
      }
    );
  });
});

describe('the topics a test needs', () => {
  it('creates the topics that are missing and leaves the ones that exist', async () => {
    const first = uniqueTopic('made');
    const second = uniqueTopic('made');
    await createTopics(connection(), [first]);
    await createTopics(connection(), [first, second, second]);
    expect(await existingTopics()).toEqual(expect.arrayContaining([first, second]));
  });

  it('creates a topic once when two tests ask for it at the same time', async () => {
    const topic = uniqueTopic('shared');
    await Promise.all([createTopics(connection(), [topic]), createTopics(connection(), [topic])]);
    expect((await existingTopics()).filter((name) => name === topic)).toEqual([topic]);
  });

  it('does nothing for an empty list, and fails on a name that Kafka refuses', async () => {
    await createTopics(connection(), []);
    await expect(createTopics(connection(), ['not a topic!'])).rejects.toThrow();
  });
});
