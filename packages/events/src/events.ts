import { type BatchObservableResult, metrics } from '@opentelemetry/api';
import { ProduceAcks, Producer, stringSerializer } from '@platformatic/kafka';
import type { HealthComponent, Logger } from '@zigordev/otel';
import { sql } from 'drizzle-orm';
import { type ConsumerDefinition, type RunningConsumer, runConsumer } from './consumer.ts';
import { type Database, type EventProducer, type OutboxRelay, startOutboxRelay } from './outbox.ts';
import { clientOptions, type KafkaConnection } from './settings.ts';
import { eventsOutbox } from './tables.ts';
import { instrumentationName, sentMessages } from './telemetry.ts';

export interface RelayOptions {
  readonly interval?: number;
  readonly batchSize?: number;
}

export interface StartEventsOptions {
  readonly connection: KafkaConnection;
  readonly db: Database;
  readonly logger: Logger;
  readonly relay?: RelayOptions | false;
  readonly consumers?: readonly ConsumerDefinition[];
  readonly lagInterval?: number;
  readonly pruneInterval?: number;
}

export interface Events {
  readonly health: HealthComponent;
  flush(): Promise<number>;
  stop(): Promise<void>;
}

export function createProducer(connection: KafkaConnection): EventProducer {
  return new Producer({
    ...clientOptions(connection),
    idempotent: true,
    acks: ProduceAcks.ALL,
    retries: 5,
    serializers: {
      key: stringSerializer,
      headerKey: stringSerializer,
      headerValue: stringSerializer,
    },
  }) as unknown as EventProducer;
}

export function startEvents(options: StartEventsOptions): Events {
  const producer = createProducer(options.connection);
  const sent = sentMessages();
  const meter = metrics.getMeter(instrumentationName);
  const backlog = meter.createObservableGauge('zigordev.events.outbox.backlog', {
    description: 'Events saved in the outbox and not yet sent to Kafka',
    unit: '{message}',
  });
  const oldest = meter.createObservableGauge('zigordev.events.outbox.oldest_age', {
    description: 'How long the oldest event in the outbox has waited',
    unit: 's',
  });
  const observeOutbox = async (result: BatchObservableResult): Promise<void> => {
    const [row] = await options.db
      .select({
        count: sql<number>`count(*)::int`,
        age: sql<number>`coalesce(extract(epoch from now() - min(${eventsOutbox.createdAt})), 0)::float8`,
      })
      .from(eventsOutbox);
    result.observe(backlog, row?.count ?? 0);
    result.observe(oldest, row?.age ?? 0);
  };
  const relayEnabled = options.relay !== false;
  if (relayEnabled) {
    meter.addBatchObservableCallback(observeOutbox, [backlog, oldest]);
  }
  const relay: OutboxRelay | undefined = relayEnabled
    ? startOutboxRelay({
        db: options.db,
        producer,
        sent,
        logger: options.logger,
        ...(options.relay === undefined ? {} : options.relay),
      })
    : undefined;
  const consumers: RunningConsumer[] = (options.consumers ?? []).map((definition) =>
    runConsumer({
      definition,
      connection: options.connection,
      db: options.db,
      producer,
      logger: options.logger,
      ...(options.lagInterval === undefined ? {} : { lagInterval: options.lagInterval }),
      ...(options.pruneInterval === undefined ? {} : { pruneInterval: options.pruneInterval }),
    })
  );

  return {
    health: {
      name: 'kafka',
      required: false,
      check: async () => {
        await producer.metadata({ topics: [], forceUpdate: true });
        return consumers.every((consumer) => consumer.healthy()) ? 'up' : 'down';
      },
    },
    flush: async () => (relay === undefined ? 0 : relay.flush()),
    stop: async () => {
      await relay?.stop();
      await Promise.all(consumers.map((consumer) => consumer.stop()));
      if (relayEnabled) {
        meter.removeBatchObservableCallback(observeOutbox, [backlog, oldest]);
      }
      await producer.close();
    },
  };
}
