import {
  type Attributes,
  type Context,
  type Counter,
  context,
  type Histogram,
  metrics,
  propagation,
  ROOT_CONTEXT,
  type TextMapGetter,
  trace,
} from '@opentelemetry/api';
import { createCounterAtZero } from '@zigordev/otel';

export const instrumentationName = '@zigordev/events';

export type TraceHeaders = Readonly<Record<string, string>>;

const mapGetter: TextMapGetter<ReadonlyMap<string, string>> = {
  keys: (carrier) => [...carrier.keys()],
  get: (carrier, key) => carrier.get(key),
};

export function activeTraceHeaders(active: Context = context.active()): Record<string, string> {
  const carrier: Record<string, string> = {};
  propagation.inject(active, carrier);
  return carrier;
}

export function contextFromHeaders(headers: TraceHeaders | ReadonlyMap<string, string>): Context {
  if (headers instanceof Map) {
    return propagation.extract(ROOT_CONTEXT, headers, mapGetter);
  }
  return propagation.extract(ROOT_CONTEXT, headers);
}

export function carriesTrace(active: Context): boolean {
  return trace.getSpanContext(active) !== undefined;
}

export function sendAttributes(topic: string): Attributes {
  return {
    'messaging.system': 'kafka',
    'messaging.operation.name': 'send',
    'messaging.operation.type': 'send',
    'messaging.destination.name': topic,
  };
}

export function processAttributes(topic: string, group: string): Attributes {
  return {
    'messaging.system': 'kafka',
    'messaging.operation.name': 'process',
    'messaging.operation.type': 'process',
    'messaging.destination.name': topic,
    'messaging.consumer.group.name': group,
  };
}

export type DeadLetterReason = 'invalid' | 'failed';

export interface ConsumerMetrics {
  readonly consumed: Counter;
  readonly duration: Histogram;
  readonly retries: Counter;
  readonly duplicates: Counter;
  readonly deadLetters: Counter;
}

export function consumerMetrics(topics: readonly string[], group: string): ConsumerMetrics {
  const meter = metrics.getMeter(instrumentationName);
  const series = topics.map((topic) => processAttributes(topic, group));
  const reasons = (['invalid', 'failed'] as const).flatMap((reason) =>
    series.map((attributes) => ({ ...attributes, 'zigordev.events.reason': reason }))
  );
  return {
    consumed: createCounterAtZero(
      meter,
      'messaging.client.consumed.messages',
      { description: 'Messages a consumer handled or skipped', unit: '{message}' },
      series
    ),
    duration: meter.createHistogram('messaging.process.duration', {
      description: 'How long the handling of one message took, retries included',
      unit: 's',
    }),
    retries: createCounterAtZero(
      meter,
      'zigordev.events.retries',
      { description: 'Attempts that failed and were tried again', unit: '{attempt}' },
      series
    ),
    duplicates: createCounterAtZero(
      meter,
      'zigordev.events.duplicates',
      { description: 'Messages skipped because their event was handled before', unit: '{message}' },
      series
    ),
    deadLetters: createCounterAtZero(
      meter,
      'zigordev.events.dead_letters',
      { description: 'Messages moved to a dead-letter topic', unit: '{message}' },
      reasons
    ),
  };
}

export function sentMessages(): Counter {
  return metrics.getMeter(instrumentationName).createCounter('messaging.client.sent.messages', {
    description: 'Messages sent to Kafka, and those that failed to send',
    unit: '{message}',
  });
}
