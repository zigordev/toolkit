import { afterEach, describe, expect, it } from 'vitest';
import { createLogger, logProcessCrashes, logStarted, logStopping } from './index.ts';

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

function setup() {
  const output = lineStream();
  return { logger: createLogger({ service: 'toolkit-test', destination: output }), output };
}

let detach: (() => void) | undefined;

afterEach(() => {
  detach?.();
  detach = undefined;
});

describe('standard process events', () => {
  it('logs service.started with the runtime and any extra fields', () => {
    const { logger, output } = setup();

    logStarted(logger, { port: 8080 });

    expect(records(output)[0]).toMatchObject({
      level: 'info',
      event: 'service.started',
      runtime: `node ${process.version}`,
      port: 8080,
    });
  });

  it('logs service.started with only the runtime by default', () => {
    const { logger, output } = setup();

    logStarted(logger);

    expect(records(output)[0]).toMatchObject({ event: 'service.started' });
  });

  it('logs service.stopping with the signal', () => {
    const { logger, output } = setup();

    logStopping(logger, 'SIGTERM');

    expect(records(output)[0]).toMatchObject({ event: 'service.stopping', signal: 'SIGTERM' });
  });

  it('logs uncaught exceptions and unhandled rejections without handling them', () => {
    const { logger, output } = setup();
    detach = logProcessCrashes(logger);

    process.emit('uncaughtExceptionMonitor', new Error('thrown'), 'uncaughtException');
    process.emit('uncaughtExceptionMonitor', new Error('rejected'), 'unhandledRejection');

    expect(records(output)).toMatchObject([
      { level: 'error', event: 'process.uncaught_exception', error: { message: 'thrown' } },
      { level: 'error', event: 'process.unhandled_rejection', error: { message: 'rejected' } },
    ]);
  });

  it('stops logging crashes once detached', () => {
    const { logger, output } = setup();
    logProcessCrashes(logger)();

    process.emit('uncaughtExceptionMonitor', new Error('thrown'), 'uncaughtException');

    expect(output.lines).toEqual([]);
  });
});
