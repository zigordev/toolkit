import { context, metrics, propagation, ROOT_CONTEXT, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { MeterProvider, MetricReader } from '@opentelemetry/sdk-metrics';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorType } from './outbox.ts';
import {
  activeTraceHeaders,
  carriesTrace,
  consumerMetrics,
  contextFromHeaders,
  processAttributes,
  sendAttributes,
} from './telemetry.ts';

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

describe('trace headers', () => {
  it('carry the active trace, and continue it on the other side', () => {
    const span = trace.getTracer('test').startSpan('request');
    const headers = context.with(trace.setSpan(context.active(), span), () => activeTraceHeaders());
    span.end();

    expect(headers.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    const continued = trace.getSpanContext(contextFromHeaders(headers));
    expect(continued?.traceId).toBe(span.spanContext().traceId);
    expect(continued?.spanId).toBe(span.spanContext().spanId);
  });

  it('read the trace from the headers of a Kafka message too', () => {
    const span = trace.getTracer('test').startSpan('request');
    const headers = activeTraceHeaders(trace.setSpan(ROOT_CONTEXT, span));
    span.end();

    const fromMap = contextFromHeaders(new Map(Object.entries(headers)));

    expect(trace.getSpanContext(fromMap)?.traceId).toBe(span.spanContext().traceId);
  });

  it('are empty outside a trace, and say so', () => {
    const headers = activeTraceHeaders(ROOT_CONTEXT);

    expect(headers).toEqual({});
    expect(carriesTrace(contextFromHeaders(headers))).toBe(false);
  });
});

describe('the attributes', () => {
  it('name the system, the operation and the topic, and never a key or a body', () => {
    expect(sendAttributes('notes.requests')).toEqual({
      'messaging.system': 'kafka',
      'messaging.operation.name': 'send',
      'messaging.operation.type': 'send',
      'messaging.destination.name': 'notes.requests',
    });
    expect(processAttributes('notes.requests', 'notifications')).toEqual({
      'messaging.system': 'kafka',
      'messaging.operation.name': 'process',
      'messaging.operation.type': 'process',
      'messaging.destination.name': 'notes.requests',
      'messaging.consumer.group.name': 'notifications',
    });
  });
});

describe('consumerMetrics', () => {
  it('starts every counter at zero for each topic it reads', async () => {
    consumerMetrics(['a.requests', 'b.requests'], 'notifications');

    const consumed = await telemetry.points('messaging.client.consumed.messages');
    expect(
      consumed.map((point) => [point.attributes['messaging.destination.name'], point.value])
    ).toEqual([
      ['a.requests', 0],
      ['b.requests', 0],
    ]);
    const deadLetters = await telemetry.points('zigordev.events.dead_letters');
    expect(deadLetters.map((point) => point.attributes['zigordev.events.reason']).sort()).toEqual([
      'failed',
      'failed',
      'invalid',
      'invalid',
    ]);
  });
});

describe('errorType', () => {
  it('prefers the code of a Kafka error, then the name, and never the message', () => {
    expect(
      errorType(Object.assign(new Error('broker 1 refused'), { code: 'PLT_KFK_NETWORK' }))
    ).toBe('PLT_KFK_NETWORK');
    expect(errorType(new TypeError('ada@example.com is wrong'))).toBe('TypeError');
    expect(errorType('a string')).toBe('_OTHER');
    expect(errorType({ code: '', name: '' })).toBe('_OTHER');
  });
});
