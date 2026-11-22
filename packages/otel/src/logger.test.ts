import { context, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { AlwaysOffSampler, AlwaysOnSampler, TracerProvider } from '@opentelemetry/sdk-trace';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLogger, type LoggerOptions } from './index.ts';

interface LineStream {
  readonly lines: string[];
  write(line: string): void;
}

function lineStream(): LineStream {
  const lines: string[] = [];
  return {
    lines,
    write(line: string) {
      lines.push(line);
    },
  };
}

function records(stream: LineStream): Record<string, unknown>[] {
  return stream.lines.map((line) => JSON.parse(line) as Record<string, unknown>);
}

function setup(options: Partial<LoggerOptions> = {}) {
  const output = lineStream();
  const logger = createLogger({
    service: 'toolkit-test',
    release: '1.2.3',
    destination: output,
    ...options,
  });
  return { logger, output };
}

beforeAll(() => {
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
});

afterAll(() => {
  context.disable();
});

describe('createLogger', () => {
  it('writes one JSON record per line in the agreed shape', () => {
    const { logger, output } = setup();

    logger.info('hello');

    const [record] = records(output);
    expect(record).toEqual({
      level: 'info',
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      service: 'toolkit-test',
      release: '1.2.3',
      message: 'hello',
    });
    expect(output.lines[0]?.endsWith('\n')).toBe(true);
  });

  it('puts the fields it is given at the top level', () => {
    const { logger, output } = setup();

    logger.info({ event: 'pool.created', poolId: 'p1', context: 'PoolService' });

    expect(records(output)[0]).toMatchObject({
      event: 'pool.created',
      poolId: 'p1',
      context: 'PoolService',
    });
  });

  it('leaves release out when it is unknown', () => {
    const { logger, output } = setup({ release: undefined });

    logger.info('hello');

    expect(records(output)[0]).not.toHaveProperty('release');
  });

  it('filters below the configured level and defaults to info', () => {
    const quiet = setup({ level: 'warn' });
    quiet.logger.info('dropped');
    quiet.logger.warn('kept');
    const normal = setup({ level: undefined });
    normal.logger.debug('dropped');
    normal.logger.info('kept');

    expect(records(quiet.output).map((record) => record.message)).toEqual(['kept']);
    expect(records(normal.output).map((record) => record.message)).toEqual(['kept']);
  });

  it('writes every level to the one stream, in order', () => {
    const { logger, output } = setup({ level: 'debug' });

    logger.debug('a');
    logger.info('b');
    logger.warn('c');
    logger.error('d');

    expect(records(output).map((record) => [record.level, record.message])).toEqual([
      ['debug', 'a'],
      ['info', 'b'],
      ['warn', 'c'],
      ['error', 'd'],
    ]);
  });

  it('serializes an error as name, message and stack', () => {
    const { logger, output } = setup();

    logger.error({ event: 'payment.failed', error: new TypeError('boom') });

    expect(records(output)[0]).toMatchObject({
      event: 'payment.failed',
      error: {
        name: 'TypeError',
        message: 'boom',
        stack: expect.stringContaining('TypeError: boom'),
      },
    });
  });

  it('passes a non-error value under error through unchanged', () => {
    const { logger, output } = setup();

    logger.error({ error: 'plain text' });

    expect(records(output)[0]).toMatchObject({ error: 'plain text' });
  });

  it('blanks the fields that are named like a secret', () => {
    const { logger, output } = setup();

    logger.info({
      password: 'p',
      user: { token: 't', name: 'kept' },
      headers: { authorization: 'Bearer x', cookie: 'c' },
    });

    expect(records(output)[0]).toMatchObject({
      password: '[redacted]',
      user: { token: '[redacted]', name: 'kept' },
      headers: { authorization: '[redacted]', cookie: '[redacted]' },
    });
  });

  it('names the trace and span of a sampled active span', () => {
    const { logger, output } = setup();
    const span = new TracerProvider({ sampler: new AlwaysOnSampler() })
      .getTracer('test')
      .startSpan('work');

    context.with(trace.setSpan(context.active(), span), () => logger.info('inside'));
    logger.info('outside');
    span.end();

    const [inside, outside] = records(output);
    expect(inside).toMatchObject({
      traceId: span.spanContext().traceId,
      spanId: span.spanContext().spanId,
    });
    expect(outside).not.toHaveProperty('traceId');
  });

  it('leaves the trace out when the span was not sampled', () => {
    const { logger, output } = setup();
    const span = new TracerProvider({ sampler: new AlwaysOffSampler() })
      .getTracer('test')
      .startSpan('work');

    context.with(trace.setSpan(context.active(), span), () => logger.info('inside'));
    span.end();

    expect(records(output)[0]).not.toHaveProperty('traceId');
  });

  it('writes to standard output when no stream is given', () => {
    const logger = createLogger({ service: 'toolkit-test', level: 'error' });

    expect(() => logger.info('filtered out')).not.toThrow();
  });
});
