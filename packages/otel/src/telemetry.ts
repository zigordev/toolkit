import type { IncomingMessage } from 'node:http';
import { type Attributes, SpanKind } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter as JsonTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPTraceExporter as ProtobufTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { startNodeSdk } from '@opentelemetry/sdk-node';
import {
  BatchSpanProcessor,
  ParentBasedSampler,
  type Sampler,
  SamplingDecision,
  type SpanExporter,
} from '@opentelemetry/sdk-trace';
import { installLoaderHooks } from './loader-hooks.ts';
import { privacySpanProcessor } from './privacy.ts';

type SdkOptions = NonNullable<Parameters<typeof startNodeSdk>[0]>;
type Instrumentations = NonNullable<SdkOptions['instrumentations']>;

export interface TelemetryOptions {
  readonly instrumentations?: Instrumentations;
}

export interface Telemetry {
  readonly shutdown: () => Promise<void>;
}

const handleKey = Symbol.for('zigordev.otel.telemetry');

type TelemetryGlobal = typeof globalThis & { [handleKey]?: Telemetry };

export function isProbeRequest(url: string | undefined): boolean {
  const path = (url ?? '').split('?')[0] ?? '';
  return path === '/health' || path === '/favicon.ico' || path.startsWith('/_next/static/');
}

function requestPath(attributes: Attributes): string | undefined {
  const path = attributes['url.path'] ?? attributes['http.target'];
  return typeof path === 'string' ? path : undefined;
}

const skipProbes: Sampler = {
  shouldSample(_context, _traceId, _spanName, spanKind, attributes) {
    if (spanKind === SpanKind.SERVER && isProbeRequest(requestPath(attributes))) {
      return { decision: SamplingDecision.NOT_RECORD };
    }
    return { decision: SamplingDecision.RECORD_AND_SAMPLED };
  },
  toString: () => 'SkipProbes',
};

export const probeAwareSampler: Sampler = new ParentBasedSampler({ root: skipProbes });

function serviceVersion(): Record<string, string> {
  const version = process.env.OTEL_SERVICE_VERSION;
  return version ? { 'service.version': version } : {};
}

function traceExporter(): SpanExporter {
  return process.env.OTEL_EXPORTER_OTLP_PROTOCOL === 'http/json'
    ? new JsonTraceExporter()
    : new ProtobufTraceExporter();
}

export function startTelemetry(options: TelemetryOptions = {}): Telemetry {
  const holder = globalThis as TelemetryGlobal;
  const existing = holder[handleKey];
  if (existing) {
    return existing;
  }
  installLoaderHooks();
  const sdk = startNodeSdk({
    ...(process.env.OTEL_LOG_LEVEL ? {} : { logLevel: 'warn' }),
    resourceAttributes: serviceVersion(),
    sampler: probeAwareSampler,
    spanProcessors: [privacySpanProcessor, new BatchSpanProcessor({ exporter: traceExporter() })],
    logRecordProcessors: [],
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-pino': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-pg': { requireParentSpan: true },
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (request: IncomingMessage) => isProbeRequest(request.url),
        },
      }),
      ...(options.instrumentations ?? []),
    ],
  });
  const telemetry: Telemetry = {
    shutdown: async () => {
      delete holder[handleKey];
      await sdk.shutdown();
    },
  };
  holder[handleKey] = telemetry;
  return telemetry;
}

export async function shutdownTelemetry(): Promise<void> {
  await (globalThis as TelemetryGlobal)[handleKey]?.shutdown();
}
