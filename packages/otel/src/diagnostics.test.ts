import { describe, expect, it } from 'vitest';
import { createDiagnostics } from './diagnostics.ts';
import { createLogger } from './logger.ts';

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

function setup() {
  const output = lineStream();
  const logger = createLogger({ service: 'toolkit-test', level: 'debug', destination: output });
  const records = (): Record<string, unknown>[] =>
    output.lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  return { diagnostics: createDiagnostics(logger), records };
}

describe('createDiagnostics', () => {
  it.each([
    ['error', 'error'],
    ['warn', 'warn'],
    ['info', 'info'],
    ['debug', 'debug'],
    ['verbose', 'debug'],
  ] as const)('writes what OpenTelemetry says at %s as a JSON line at %s', (method, level) => {
    const { diagnostics, records } = setup();

    diagnostics.logger[method]('exporter %s is %s', 'otlp', 'ready');

    expect(records()).toEqual([
      expect.objectContaining({
        level,
        service: 'toolkit-test',
        source: 'opentelemetry',
        message: 'exporter otlp is ready',
      }),
    ]);
  });

  it('keeps an error that comes with a message as the error of the line', () => {
    const { diagnostics, records } = setup();

    diagnostics.logger.warn('The last send failed.', new Error('connect ECONNREFUSED'));

    expect(records()).toEqual([
      expect.objectContaining({
        level: 'warn',
        message: 'The last send failed.',
        error: {
          name: 'Error',
          message: 'connect ECONNREFUSED',
          stack: expect.stringContaining('Error: connect ECONNREFUSED'),
        },
      }),
    ]);
  });

  it('writes a failure inside OpenTelemetry as an error line, with the failure whole', () => {
    const { diagnostics, records } = setup();

    diagnostics.onError(new Error('metrics export failed'));

    expect(records()).toEqual([
      expect.objectContaining({
        level: 'error',
        source: 'opentelemetry',
        message: 'metrics export failed',
        error: expect.objectContaining({ name: 'Error', message: 'metrics export failed' }),
      }),
    ]);
  });

  it('writes a failure that is no error as it reads', () => {
    const { diagnostics, records } = setup();

    diagnostics.onError('the exporter gave up');
    diagnostics.onError({ code: 14, message: 'unavailable' });

    expect(records().map((record) => [record.level, record.message])).toEqual([
      ['error', 'the exporter gave up'],
      ['error', "{ code: 14, message: 'unavailable' }"],
    ]);
    expect(records()[0]).not.toHaveProperty('error');
  });
});
