import { TraceFlags, trace } from '@opentelemetry/api';
import { type DestinationStream, destination, type Logger, pino } from 'pino';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerOptions {
  readonly service: string;
  readonly release?: string | undefined;
  readonly level?: LogLevel | undefined;
  readonly destination?: DestinationStream;
}

export type { Logger };

const redactedPaths = [
  'password',
  'token',
  'secret',
  'authorization',
  'cookie',
  '*.password',
  '*.token',
  '*.secret',
  '*.authorization',
  '*.cookie',
  'headers.authorization',
  'headers.cookie',
];

function traceFields(): Record<string, string> {
  const span = trace.getActiveSpan();
  if (span === undefined) {
    return {};
  }
  const context = span.spanContext();
  if ((context.traceFlags & TraceFlags.SAMPLED) === 0) {
    return {};
  }
  return { traceId: context.traceId, spanId: context.spanId };
}

function serializeError(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

export function createLogger(options: LoggerOptions): Logger {
  return pino(
    {
      level: options.level ?? 'info',
      messageKey: 'message',
      errorKey: 'error',
      base: options.release
        ? { service: options.service, release: options.release }
        : { service: options.service },
      timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
      formatters: { level: (label) => ({ level: label }) },
      serializers: { error: serializeError },
      mixin: traceFields,
      redact: { paths: redactedPaths, censor: '[redacted]' },
    },
    options.destination ?? destination({ fd: 1, sync: true })
  );
}

export function createProcessLogger(): Logger {
  return createLogger({
    service: process.env.OTEL_SERVICE_NAME || 'unknown_service',
    release: process.env.OTEL_SERVICE_VERSION || undefined,
    level: 'debug',
  });
}
