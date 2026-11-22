import { ROOT_CONTEXT, SpanKind, TraceFlags, trace } from '@opentelemetry/api';
import { BatchSpanProcessor, SamplingDecision } from '@opentelemetry/sdk-trace';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { privacySpanProcessor } from './privacy.ts';

const sdk = vi.hoisted(() => ({
  startNodeSdk: vi.fn(),
  shutdown: vi.fn(async () => undefined),
  installLoaderHooks: vi.fn(),
  autoInstrumentations: vi.fn((config: unknown) => ({ auto: config })),
  exporters: [] as string[],
}));

vi.mock('@opentelemetry/sdk-node', () => ({ startNodeSdk: sdk.startNodeSdk }));
vi.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: sdk.autoInstrumentations,
}));
vi.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: class {
    constructor() {
      sdk.exporters.push('http/json');
    }
  },
}));
vi.mock('@opentelemetry/exporter-trace-otlp-proto', () => ({
  OTLPTraceExporter: class {
    constructor() {
      sdk.exporters.push('http/protobuf');
    }
  },
}));
vi.mock('./loader-hooks.ts', () => ({ installLoaderHooks: sdk.installLoaderHooks }));

const { isProbeRequest, shutdownTelemetry, startTelemetry } = await import('./index.ts');
const { probeAwareSampler } = await import('./telemetry.ts');

type StartOptions = {
  sampler: unknown;
  logLevel?: string;
  resourceAttributes: Record<string, string>;
  spanProcessors: unknown[];
  logRecordProcessors: unknown[];
  instrumentations: unknown[];
};

function lastStartOptions(): StartOptions {
  return sdk.startNodeSdk.mock.lastCall?.[0] as StartOptions;
}

beforeEach(() => {
  sdk.startNodeSdk.mockReturnValue({ shutdown: sdk.shutdown });
  vi.stubEnv('OTEL_LOG_LEVEL', undefined);
  vi.stubEnv('OTEL_SERVICE_VERSION', undefined);
  vi.stubEnv('OTEL_EXPORTER_OTLP_PROTOCOL', undefined);
});

afterEach(async () => {
  await shutdownTelemetry();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  sdk.exporters.length = 0;
});

describe('startTelemetry', () => {
  it('installs the loader hooks and starts the SDK with logs off OTLP and probes skipped', () => {
    startTelemetry();

    expect(sdk.installLoaderHooks).toHaveBeenCalledTimes(1);
    expect(lastStartOptions()).toMatchObject({ logLevel: 'warn', logRecordProcessors: [] });
    expect(lastStartOptions().sampler).toBe(probeAwareSampler);
  });

  it('cleans every span before the batch that exports it', () => {
    startTelemetry();

    const [first, second, ...rest] = lastStartOptions().spanProcessors;
    expect(first).toBe(privacySpanProcessor);
    expect(second).toBeInstanceOf(BatchSpanProcessor);
    expect(rest).toEqual([]);
  });

  it('sends traces as protobuf', () => {
    startTelemetry();

    expect(sdk.exporters).toEqual(['http/protobuf']);
  });

  it('sends traces as JSON when the protocol says so', () => {
    vi.stubEnv('OTEL_EXPORTER_OTLP_PROTOCOL', 'http/json');

    startTelemetry();

    expect(sdk.exporters).toEqual(['http/json']);
  });

  it('sets service.version from OTEL_SERVICE_VERSION when it is set', () => {
    vi.stubEnv('OTEL_SERVICE_VERSION', '1.4.0');

    startTelemetry();

    expect(lastStartOptions().resourceAttributes).toEqual({ 'service.version': '1.4.0' });
  });

  it('leaves the resource alone without OTEL_SERVICE_VERSION', () => {
    vi.stubEnv('OTEL_SERVICE_VERSION', '');

    startTelemetry();

    expect(lastStartOptions().resourceAttributes).toEqual({});
  });

  it('lets OTEL_LOG_LEVEL decide the diagnostic level when it is set', () => {
    vi.stubEnv('OTEL_LOG_LEVEL', 'debug');

    startTelemetry();

    expect(lastStartOptions()).not.toHaveProperty('logLevel');
  });

  it('treats an empty OTEL_LOG_LEVEL as not set', () => {
    vi.stubEnv('OTEL_LOG_LEVEL', '');

    startTelemetry();

    expect(lastStartOptions().logLevel).toBe('warn');
  });

  it('turns off fs and pino instrumentation and skips probe requests', () => {
    startTelemetry();

    const config = sdk.autoInstrumentations.mock.lastCall?.[0] as Record<
      string,
      Record<string, unknown>
    >;
    expect(config['@opentelemetry/instrumentation-fs']).toEqual({ enabled: false });
    expect(config['@opentelemetry/instrumentation-pino']).toEqual({ enabled: false });
    const ignore = config['@opentelemetry/instrumentation-http']
      ?.ignoreIncomingRequestHook as (request: { url?: string }) => boolean;
    expect(ignore({ url: '/health' })).toBe(true);
    expect(ignore({ url: '/api/v1/pools' })).toBe(false);
  });

  it('keeps background database and socket calls out of traces', () => {
    startTelemetry();

    const config = sdk.autoInstrumentations.mock.lastCall?.[0] as Record<
      string,
      Record<string, unknown>
    >;
    expect(config['@opentelemetry/instrumentation-net']).toEqual({ enabled: false });
    expect(config['@opentelemetry/instrumentation-dns']).toEqual({ enabled: false });
    expect(config['@opentelemetry/instrumentation-pg']).toEqual({ requireParentSpan: true });
  });

  it('adds the instrumentations it is given after the automatic ones', () => {
    const extra = { name: 'extra' };

    startTelemetry({ instrumentations: [extra as never] });

    expect(lastStartOptions().instrumentations).toEqual([
      expect.objectContaining({ auto: expect.anything() }),
      extra,
    ]);
  });

  it('starts once per process and returns the same handle', () => {
    const first = startTelemetry();
    const second = startTelemetry();

    expect(second).toBe(first);
    expect(sdk.startNodeSdk).toHaveBeenCalledTimes(1);
  });

  it('shuts the SDK down and can start again afterwards', async () => {
    startTelemetry();

    await shutdownTelemetry();
    startTelemetry();

    expect(sdk.shutdown).toHaveBeenCalledTimes(1);
    expect(sdk.startNodeSdk).toHaveBeenCalledTimes(2);
  });

  it('does nothing on shutdown when telemetry never started', async () => {
    await shutdownTelemetry();

    expect(sdk.shutdown).not.toHaveBeenCalled();
  });

  it('starts from the register entry point', async () => {
    await import('./register.ts');

    expect(sdk.startNodeSdk).toHaveBeenCalledTimes(1);
  });
});

describe('isProbeRequest', () => {
  it.each([
    ['/health', true],
    ['/health?probe=1', true],
    ['/favicon.ico', true],
    ['/_next/static/chunks/main.js', true],
    ['/api/v1/pools', false],
    ['/healthy', false],
    [undefined, false],
  ])('treats %s as a probe: %s', (url, expected) => {
    expect(isProbeRequest(url)).toBe(expected);
  });
});

describe('probeAwareSampler', () => {
  function decide(kind: SpanKind, attributes: Record<string, string>, parent = ROOT_CONTEXT) {
    return probeAwareSampler.shouldSample(parent, 'a'.repeat(32), 'span', kind, attributes, [])
      .decision;
  }

  function parentWith(traceFlags: TraceFlags) {
    return trace.setSpanContext(ROOT_CONTEXT, {
      traceId: 'b'.repeat(32),
      spanId: 'c'.repeat(16),
      traceFlags,
      isRemote: false,
    });
  }

  it('drops server spans for probe paths, whichever tracer starts them', () => {
    expect(decide(SpanKind.SERVER, { 'url.path': '/health' })).toBe(SamplingDecision.NOT_RECORD);
    expect(decide(SpanKind.SERVER, { 'http.target': '/health?probe=1' })).toBe(
      SamplingDecision.NOT_RECORD
    );
  });

  it('keeps every other span', () => {
    expect(decide(SpanKind.SERVER, { 'url.path': '/api/v1/pools' })).toBe(
      SamplingDecision.RECORD_AND_SAMPLED
    );
    expect(decide(SpanKind.CLIENT, { 'url.path': '/health' })).toBe(
      SamplingDecision.RECORD_AND_SAMPLED
    );
    expect(decide(SpanKind.INTERNAL, {})).toBe(SamplingDecision.RECORD_AND_SAMPLED);
    expect(decide(SpanKind.SERVER, {})).toBe(SamplingDecision.RECORD_AND_SAMPLED);
  });

  it('names itself after the probe rule', () => {
    expect(probeAwareSampler.toString()).toContain('SkipProbes');
  });

  it('follows the parent span', () => {
    expect(decide(SpanKind.INTERNAL, {}, parentWith(TraceFlags.SAMPLED))).toBe(
      SamplingDecision.RECORD_AND_SAMPLED
    );
    expect(decide(SpanKind.INTERNAL, {}, parentWith(TraceFlags.NONE))).toBe(
      SamplingDecision.NOT_RECORD
    );
  });
});
