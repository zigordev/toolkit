import { hostname } from 'node:os';
import { DiagLogLevel, diag, ROOT_CONTEXT, SpanKind, TraceFlags, trace } from '@opentelemetry/api';
import {
  osDetector,
  processDetector,
  serviceInstanceIdDetector,
  serviceNameEnvDetector,
} from '@opentelemetry/resources';
import { BatchSpanProcessor, SamplingDecision } from '@opentelemetry/sdk-trace';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { privacySpanProcessor } from './privacy.ts';

const sdk = vi.hoisted(() => ({
  startNodeSdk: vi.fn(),
  shutdown: vi.fn(async () => undefined),
  installLoaderHooks: vi.fn(),
  captureOutput: vi.fn(),
  setGlobalErrorHandler: vi.fn(),
  diagnostics: {
    logger: {
      error: () => undefined,
      warn: () => undefined,
      info: () => undefined,
      debug: () => undefined,
      verbose: () => undefined,
    },
    onError: () => undefined,
  },
  instrumentation: (name: string) =>
    class {
      readonly name = name;
      readonly config: unknown;
      constructor(config?: unknown) {
        this.config = config;
      }
    },
  exporters: [] as string[],
}));

vi.mock('@opentelemetry/sdk-node', () => ({ startNodeSdk: sdk.startNodeSdk }));
vi.mock('@opentelemetry/instrumentation-http', () => ({
  HttpInstrumentation: sdk.instrumentation('http'),
}));
vi.mock('@opentelemetry/instrumentation-undici', () => ({
  UndiciInstrumentation: sdk.instrumentation('undici'),
}));
vi.mock('@opentelemetry/instrumentation-pg', () => ({
  PgInstrumentation: sdk.instrumentation('pg'),
}));
vi.mock('@opentelemetry/instrumentation-runtime-node', () => ({
  RuntimeNodeInstrumentation: sdk.instrumentation('runtime-node'),
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
vi.mock('./output.ts', () => ({ captureOutput: sdk.captureOutput }));
vi.mock('./diagnostics.ts', () => ({ createDiagnostics: () => sdk.diagnostics }));
vi.mock('@opentelemetry/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@opentelemetry/core')>()),
  setGlobalErrorHandler: sdk.setGlobalErrorHandler,
}));

const { isProbeRequest, shutdownTelemetry, startTelemetry } = await import('./index.ts');
const { hostNameDetector, probeAwareSampler } = await import('./telemetry.ts');

type StartOptions = {
  sampler: unknown;
  logLevel?: string;
  resourceAttributes: Record<string, string>;
  resourceDetectors: unknown[];
  spanProcessors: unknown[];
  logRecordProcessors: unknown[];
  instrumentations: { name: string; config?: Record<string, unknown> }[];
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

  it('says who sends: the service, its process, its system and the name of its host', () => {
    startTelemetry();

    expect(lastStartOptions().resourceDetectors).toEqual([
      serviceInstanceIdDetector,
      serviceNameEnvDetector,
      processDetector,
      osDetector,
      hostNameDetector,
    ]);
  });

  it('names the host, and never reads the id of the machine', () => {
    expect(hostNameDetector.detect()).toEqual({ attributes: { 'host.name': hostname() } });
  });

  it('lets OTEL_LOG_LEVEL decide the diagnostic level when it is set', () => {
    vi.stubEnv('OTEL_LOG_LEVEL', 'debug');

    startTelemetry();

    expect(lastStartOptions().logLevel).toBe('debug');
  });

  it('has OpenTelemetry say what it has to say through the logger, warnings and errors only', () => {
    const setLogger = vi.spyOn(diag, 'setLogger');

    startTelemetry();

    expect(setLogger).toHaveBeenCalledTimes(1);
    expect(setLogger).toHaveBeenCalledWith(sdk.diagnostics.logger, {
      logLevel: DiagLogLevel.WARN,
      suppressOverrideMessage: true,
    });
    expect(sdk.startNodeSdk.mock.invocationCallOrder[0]).toBeLessThan(
      setLogger.mock.invocationCallOrder[0] ?? 0
    );
    setLogger.mockRestore();
  });

  it('lets it say more through the same logger when OTEL_LOG_LEVEL asks for more', () => {
    const setLogger = vi.spyOn(diag, 'setLogger');
    vi.stubEnv('OTEL_LOG_LEVEL', 'debug');

    startTelemetry();

    expect(setLogger).toHaveBeenCalledWith(sdk.diagnostics.logger, {
      logLevel: DiagLogLevel.DEBUG,
      suppressOverrideMessage: true,
    });
    setLogger.mockRestore();
  });

  it('hands the failures inside OpenTelemetry to the same logger', () => {
    startTelemetry();

    expect(sdk.setGlobalErrorHandler).toHaveBeenCalledTimes(1);
    expect(sdk.setGlobalErrorHandler).toHaveBeenCalledWith(sdk.diagnostics.onError);
  });

  it('treats an empty OTEL_LOG_LEVEL as not set', () => {
    vi.stubEnv('OTEL_LOG_LEVEL', '');

    startTelemetry();

    expect(lastStartOptions().logLevel).toBe('warn');
  });

  it('records requests in and out, database queries and the runtime, and nothing else', () => {
    startTelemetry();

    expect(lastStartOptions().instrumentations.map((entry) => entry.name)).toEqual([
      'http',
      'undici',
      'pg',
      'runtime-node',
    ]);
  });

  it('skips probe requests', () => {
    startTelemetry();

    const [http] = lastStartOptions().instrumentations;
    const ignore = http?.config?.ignoreIncomingRequestHook as (request: {
      url?: string;
    }) => boolean;
    expect(ignore({ url: '/health' })).toBe(true);
    expect(ignore({ url: '/api/v1/pools' })).toBe(false);
  });

  it('keeps background calls and queries out of traces', () => {
    startTelemetry();

    const [http, undici, pg] = lastStartOptions().instrumentations;
    expect(http?.config).toMatchObject({ requireParentforOutgoingSpans: true });
    expect(undici?.config).toEqual({ requireParentforSpans: true });
    expect(pg?.config).toEqual({ requireParentSpan: true });
  });

  it('adds the instrumentations it is given after its own', () => {
    const extra = { name: 'extra' };

    startTelemetry({ instrumentations: [extra as never] });

    expect(lastStartOptions().instrumentations.map((entry) => entry.name)).toEqual([
      'http',
      'undici',
      'pg',
      'runtime-node',
      'extra',
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

  it('ends the stop normally when the last telemetry cannot be sent', async () => {
    const warn = vi.spyOn(diag, 'warn').mockImplementation(() => undefined);
    sdk.shutdown.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    startTelemetry();

    await expect(shutdownTelemetry()).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      'The last telemetry could not be sent before the stop.',
      expect.objectContaining({ message: 'connect ECONNREFUSED' })
    );
    warn.mockRestore();
  });

  it('does nothing on shutdown when telemetry never started', async () => {
    await shutdownTelemetry();

    expect(sdk.shutdown).not.toHaveBeenCalled();
  });

  it('captures the output, then starts, from the register entry point', async () => {
    await import('./register.ts');

    expect(sdk.captureOutput).toHaveBeenCalledTimes(1);
    expect(sdk.captureOutput).toHaveBeenCalledWith();
    expect(sdk.startNodeSdk).toHaveBeenCalledTimes(1);
    expect(sdk.captureOutput.mock.invocationCallOrder[0]).toBeLessThan(
      sdk.startNodeSdk.mock.invocationCallOrder[0] ?? 0
    );
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
