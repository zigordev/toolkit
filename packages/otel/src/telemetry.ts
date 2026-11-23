import type { IncomingMessage } from 'node:http';
import { hostname } from 'node:os';
import { type Attributes, diag, SpanKind } from '@opentelemetry/api';
import { diagLogLevelFromString, setGlobalErrorHandler } from '@opentelemetry/core';
import { OTLPTraceExporter as JsonTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPTraceExporter as ProtobufTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import {
  osDetector,
  processDetector,
  type ResourceDetector,
  serviceInstanceIdDetector,
  serviceNameEnvDetector,
} from '@opentelemetry/resources';
import { startNodeSdk } from '@opentelemetry/sdk-node';
import {
  BatchSpanProcessor,
  ParentBasedSampler,
  type Sampler,
  SamplingDecision,
  type SpanExporter,
} from '@opentelemetry/sdk-trace';
import { createDiagnostics } from './diagnostics.ts';
import { installLoaderHooks } from './loader-hooks.ts';
import { createProcessLogger } from './logger.ts';
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

export const hostNameDetector: ResourceDetector = {
  detect: () => ({ attributes: { 'host.name': hostname() } }),
};

const resourceDetectors: ResourceDetector[] = [
  serviceInstanceIdDetector,
  serviceNameEnvDetector,
  processDetector,
  osDetector,
  hostNameDetector,
];

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
  const logLevel = process.env.OTEL_LOG_LEVEL || 'warn';
  const sdk = startNodeSdk({
    logLevel,
    resourceAttributes: serviceVersion(),
    resourceDetectors,
    sampler: probeAwareSampler,
    spanProcessors: [privacySpanProcessor, new BatchSpanProcessor({ exporter: traceExporter() })],
    logRecordProcessors: [],
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (request: IncomingMessage) => isProbeRequest(request.url),
        requireParentforOutgoingSpans: true,
      }),
      new UndiciInstrumentation({ requireParentforSpans: true }),
      new PgInstrumentation({ requireParentSpan: true }),
      new RuntimeNodeInstrumentation(),
      ...(options.instrumentations ?? []),
    ],
  });
  const diagnostics = createDiagnostics(createProcessLogger());
  diag.setLogger(diagnostics.logger, {
    logLevel: diagLogLevelFromString(logLevel),
    suppressOverrideMessage: true,
  });
  setGlobalErrorHandler(diagnostics.onError);
  const telemetry: Telemetry = {
    shutdown: async () => {
      delete holder[handleKey];
      await sdk.shutdown().catch((error: unknown) => {
        diag.warn('The last telemetry could not be sent before the stop.', error);
      });
    },
  };
  holder[handleKey] = telemetry;
  return telemetry;
}

export async function shutdownTelemetry(): Promise<void> {
  await (globalThis as TelemetryGlobal)[handleKey]?.shutdown();
}
