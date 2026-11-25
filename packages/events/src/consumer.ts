import {
  metrics,
  type ObservableResult,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import {
  Consumer,
  type Message,
  type MessagesStream,
  MessagesStreamFallbackModes,
  MessagesStreamModes,
  stringDeserializer,
} from '@platformatic/kafka';
import type { Logger } from '@zigordev/otel';
import { and, eq, lt, sql } from 'drizzle-orm';
import { type EventDefinition, type EventsOf, readEnvelope } from './event.ts';
import { type Database, type EventProducer, errorType } from './outbox.ts';
import { clientOptions, type KafkaConnection } from './settings.ts';
import { handledEvents } from './tables.ts';
import {
  type ConsumerMetrics,
  consumerMetrics,
  contextFromHeaders,
  type DeadLetterReason,
  instrumentationName,
  processAttributes,
} from './telemetry.ts';

export interface HandleContext {
  readonly tx: Database;
  readonly topic: string;
  readonly partition: number;
  readonly offset: bigint;
  readonly attempt: number;
}

export interface ConsumerDefinition<
  Definitions extends readonly EventDefinition[] = readonly EventDefinition[],
> {
  readonly group: string;
  readonly topics: readonly string[];
  readonly events: Definitions;
  readonly handle: (event: EventsOf<Definitions>, context: HandleContext) => Promise<void>;
  readonly retryDelays?: readonly number[];
  readonly deadLetterTopic?: (topic: string) => string;
  readonly keepHandledFor?: number;
}

export function defineConsumer<const Definitions extends readonly EventDefinition[]>(
  definition: ConsumerDefinition<Definitions>
): ConsumerDefinition {
  if (definition.topics.length === 0) {
    throw new Error(`The consumer ${definition.group} reads no topic`);
  }
  if (definition.events.length === 0) {
    throw new Error(`The consumer ${definition.group} knows no event`);
  }
  return definition as unknown as ConsumerDefinition;
}

export const defaultRetryDelays: readonly number[] = [1_000, 5_000, 25_000];

export const deadLetterTopicOf = (topic: string): string => `${topic}.dead-letter`;

const day = 24 * 60 * 60 * 1000;

export interface RunConsumerOptions {
  readonly definition: ConsumerDefinition;
  readonly connection: KafkaConnection;
  readonly db: Database;
  readonly producer: EventProducer;
  readonly logger: Logger;
  readonly lagInterval?: number;
  readonly pruneInterval?: number;
  readonly restartPause?: number;
}

export interface RunningConsumer {
  readonly group: string;
  readonly healthy: () => boolean;
  stop(): Promise<void>;
}

class Stopped extends Error {
  override readonly name = 'Stopped';
}

type Incoming = Message<string, Buffer, string, string>;

export function runConsumer(options: RunConsumerOptions): RunningConsumer {
  const { definition, logger } = options;
  const { group } = definition;
  const delays = definition.retryDelays ?? defaultRetryDelays;
  const deadLetterTopic = definition.deadLetterTopic ?? deadLetterTopicOf;
  const keepHandledFor = definition.keepHandledFor ?? 30 * day;
  const counters: ConsumerMetrics = consumerMetrics(definition.topics, group);
  const tracer = trace.getTracer(instrumentationName);
  const meter = metrics.getMeter(instrumentationName);
  const lagGauge = meter.createObservableGauge('zigordev.events.consumer.lag', {
    description: 'Messages written to a topic that the consumer group has not handled yet',
    unit: '{message}',
  });
  const lag = new Map<string, number>();
  const observeLag = (result: ObservableResult): void => {
    for (const [topic, value] of lag) {
      result.observe(value, processAttributes(topic, group));
    }
  };
  lagGauge.addCallback(observeLag);

  let stopping = false;
  let busy = false;
  let connected = false;
  let consumer: Consumer<string, Buffer, string, string> | undefined;
  let stream: MessagesStream<string, Buffer, string, string> | undefined;
  const abort = new AbortController();

  const pause = (ms: number): Promise<void> =>
    new Promise((resolve, reject) => {
      if (abort.signal.aborted) {
        reject(new Stopped());
        return;
      }
      const timer = setTimeout(() => {
        abort.signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      function onAbort(): void {
        clearTimeout(timer);
        reject(new Stopped());
      }
      abort.signal.addEventListener('abort', onAbort, { once: true });
    });

  const deadLetter = async (
    message: Incoming,
    reason: DeadLetterReason,
    detail: string
  ): Promise<void> => {
    const headers = new Map(message.headers);
    headers.set('dead-letter.reason', reason);
    headers.set('dead-letter.detail', detail);
    headers.set('dead-letter.topic', message.topic);
    headers.set('dead-letter.partition', String(message.partition));
    headers.set('dead-letter.offset', String(message.offset));
    headers.set('dead-letter.group', group);
    await options.producer.send({
      messages: [
        {
          topic: deadLetterTopic(message.topic),
          ...(message.key === undefined || message.key === null ? {} : { key: message.key }),
          value: message.value ?? Buffer.alloc(0),
          headers,
        },
      ],
    });
    counters.deadLetters.add(1, {
      ...processAttributes(message.topic, group),
      'zigordev.events.reason': reason,
    });
  };

  const attempt = async (
    event: EventsOf<readonly EventDefinition[]>,
    message: Incoming
  ): Promise<'handled' | 'duplicate' | 'dead_lettered'> => {
    const attributes = processAttributes(message.topic, group);
    for (let number = 1; ; number += 1) {
      try {
        const fresh = await options.db.transaction(async (tx) => {
          const inserted = await tx
            .insert(handledEvents)
            .values({ consumer: group, eventId: event.id })
            .onConflictDoNothing()
            .returning({ eventId: handledEvents.eventId });
          if (inserted.length === 0) {
            return false;
          }
          await definition.handle(event, {
            tx,
            topic: message.topic,
            partition: message.partition,
            offset: message.offset,
            attempt: number,
          });
          return true;
        });
        return fresh ? 'handled' : 'duplicate';
      } catch (error) {
        if (stopping) {
          throw new Stopped();
        }
        const fields = {
          topic: message.topic,
          group,
          eventId: event.id,
          type: event.type,
          attempt: number,
          error,
        };
        const delay = delays[number - 1];
        if (delay === undefined) {
          logger.error({ event: 'events.dead_lettered', reason: 'failed', ...fields });
          await deadLetter(message, 'failed', errorType(error));
          return 'dead_lettered';
        }
        logger.warn({ event: 'events.handling_retried', ...fields });
        counters.retries.add(1, attributes);
        await pause(delay);
      }
    }
  };

  const process = async (message: Incoming): Promise<void> => {
    const attributes = processAttributes(message.topic, group);
    const started = performance.now();
    const parent = contextFromHeaders(message.headers);
    const outcome = await tracer.startActiveSpan(
      `process ${message.topic}`,
      {
        kind: SpanKind.CONSUMER,
        attributes: {
          ...attributes,
          'messaging.destination.partition.id': String(message.partition),
          'messaging.kafka.offset': Number(message.offset),
        },
      },
      parent,
      async (span) => {
        try {
          const reading = readEnvelope(definition.events, message.value);
          if (!reading.ok) {
            logger.error({
              event: 'events.message_rejected',
              topic: message.topic,
              group,
              partition: message.partition,
              offset: String(message.offset),
              reason: reading.reason,
              ...(reading.type === undefined ? {} : { type: reading.type }),
            });
            span.setStatus({ code: SpanStatusCode.ERROR, message: reading.reason });
            await deadLetter(message, 'invalid', reading.reason);
            return 'dead_lettered' as const;
          }
          span.setAttribute('messaging.message.id', reading.event.id);
          const result = await attempt(reading.event, message);
          if (result === 'dead_lettered') {
            span.setStatus({ code: SpanStatusCode.ERROR, message: 'dead_lettered' });
          }
          return result;
        } finally {
          span.end();
        }
      }
    );
    await message.commit();
    if (outcome === 'duplicate') {
      counters.duplicates.add(1, attributes);
    }
    counters.consumed.add(1, attributes);
    counters.duration.record(
      (performance.now() - started) / 1000,
      outcome === 'dead_lettered' ? { ...attributes, 'error.type': 'dead_lettered' } : attributes
    );
  };

  const prune = async (): Promise<void> => {
    try {
      await options.db
        .delete(handledEvents)
        .where(
          and(
            eq(handledEvents.consumer, group),
            lt(handledEvents.handledAt, sql`now() - ${`${keepHandledFor} milliseconds`}::interval`)
          )
        );
    } catch (error) {
      logger.warn({ event: 'events.prune_failed', group, error });
    }
  };
  const pruning = setInterval(() => void prune(), options.pruneInterval ?? 60 * 60 * 1000);
  pruning.unref();

  const runOnce = async (): Promise<void> => {
    const current = new Consumer({
      ...clientOptions(options.connection),
      groupId: group,
      autocommit: false,
      deserializers: {
        key: stringDeserializer,
        headerKey: stringDeserializer,
        headerValue: stringDeserializer,
      },
    }) as unknown as Consumer<string, Buffer, string, string>;
    consumer = current;
    current.on('consumer:lag', (offsets: Map<string, bigint[]>) => {
      for (const [topic, partitions] of offsets) {
        let total = 0;
        for (const value of partitions) {
          if (value >= 0n) {
            total += Number(value);
          }
        }
        lag.set(topic, total);
      }
    });
    try {
      stream = await current.consume({
        topics: [...definition.topics],
        mode: MessagesStreamModes.COMMITTED,
        fallbackMode: MessagesStreamFallbackModes.EARLIEST,
        autocommit: false,
      });
      current.startLagMonitoring({ topics: [...definition.topics] }, options.lagInterval ?? 30_000);
      connected = true;
      for await (const message of stream) {
        busy = true;
        try {
          await process(message);
        } finally {
          busy = false;
        }
        if (stopping) {
          break;
        }
      }
    } finally {
      connected = false;
      current.stopLagMonitoring();
      await current.close(true).catch(() => undefined);
      consumer = undefined;
      stream = undefined;
    }
  };

  const running = (async () => {
    let failures = 0;
    const restartPause = options.restartPause ?? 1_000;
    while (!stopping) {
      try {
        await runOnce();
        failures = 0;
      } catch (error) {
        if (stopping || error instanceof Stopped) {
          break;
        }
        failures += 1;
        logger.warn({ event: 'events.consumer_restarting', group, attempt: failures, error });
      }
      if (stopping) {
        break;
      }
      try {
        await pause(Math.min(restartPause * 2 ** Math.max(failures - 1, 0), 30_000));
      } catch {
        break;
      }
    }
  })();

  return {
    group,
    healthy: () => connected && consumer !== undefined,
    stop: async () => {
      stopping = true;
      abort.abort();
      clearInterval(pruning);
      if (!busy) {
        await stream?.close().catch(() => undefined);
      }
      if (!connected) {
        await consumer?.close(true).catch(() => undefined);
      }
      await running;
      lagGauge.removeCallback(observeLag);
    },
  };
}
