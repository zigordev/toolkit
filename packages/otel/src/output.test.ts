import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./logger.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./logger.ts')>();
  return { ...actual, createProcessLogger: vi.fn(actual.createProcessLogger) };
});

const { createLogger, createProcessLogger } = await import('./logger.ts');
const { captureOutput } = await import('./index.ts');

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
  const logger = createLogger({
    service: 'toolkit-test',
    release: '1.2.3',
    level: 'debug',
    destination: output,
  });
  return { logger, output };
}

function nextTick(): Promise<void> {
  return new Promise((resolve) => process.nextTick(resolve));
}

const printer: Console = globalThis.console;
let restore: (() => void) | undefined;

afterEach(() => {
  restore?.();
  restore = undefined;
  vi.mocked(createProcessLogger).mockClear();
});

describe('captureOutput', () => {
  it('writes what console prints as one JSON line, in the shape of every other line', () => {
    const { logger, output } = setup();
    restore = captureOutput(logger);

    printer.log('listening on %d, as %s', 3000, 'web');

    expect(records(output)).toEqual([
      {
        level: 'info',
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        service: 'toolkit-test',
        release: '1.2.3',
        source: 'console',
        message: 'listening on 3000, as web',
      },
    ]);
  });

  it.each([
    ['debug', 'debug'],
    ['log', 'info'],
    ['info', 'info'],
    ['warn', 'warn'],
    ['error', 'error'],
  ] as const)('gives console.%s the level %s', (method, level) => {
    const { logger, output } = setup();
    restore = captureOutput(logger);

    printer[method]('said with %s', method);

    expect(records(output)).toEqual([
      expect.objectContaining({ level, source: 'console', message: `said with ${method}` }),
    ]);
  });

  it('keeps an error whole, with its stack, in one line', () => {
    const { logger, output } = setup();
    restore = captureOutput(logger);

    printer.error(new Error('boom'));

    const [record] = records(output);
    expect(output.lines).toHaveLength(1);
    expect(record?.level).toBe('error');
    expect(record?.message).toMatch(/^Error: boom\n {4}at /);
  });

  it('writes a trace with the stack of the caller, at the level debug', () => {
    const { logger, output } = setup();
    restore = captureOutput(logger);

    printer.trace('reached %s', 'here');

    const [record] = records(output);
    expect(record?.level).toBe('debug');
    expect(record?.message).toMatch(/^Trace: reached here\n {4}at /);
    expect(record?.message).toContain('output.test.ts');
  });

  it('writes what console.dir shows of a value', () => {
    const { logger, output } = setup();
    restore = captureOutput(logger);

    printer.dir({ pool: { members: [1, 2] } }, { depth: 0 });

    expect(records(output)).toEqual([
      expect.objectContaining({ level: 'info', source: 'console', message: '{ pool: [Object] }' }),
    ]);
  });

  it('catches the console methods that are built on these', () => {
    const { logger, output } = setup();
    restore = captureOutput(logger);

    printer.assert(false, 'the pool is %s', 'empty');
    printer.table([{ members: 2 }]);

    const [assertion, table] = records(output);
    expect(assertion).toMatchObject({
      level: 'warn',
      message: 'Assertion failed: the pool is empty',
    });
    expect(table?.level).toBe('info');
    expect(table?.message).toContain('members');
    expect(output.lines).toHaveLength(2);
  });

  it('writes a warning of Node.js as a JSON line, with its code', async () => {
    const { logger, output } = setup();
    restore = captureOutput(logger);

    process.emitWarning('The old way is going away', {
      type: 'DeprecationWarning',
      code: 'DEP9999',
    });
    await nextTick();

    expect(records(output)).toEqual([
      expect.objectContaining({
        level: 'warn',
        event: 'process.warning',
        code: 'DEP9999',
        error: {
          name: 'DeprecationWarning',
          message: 'The old way is going away',
          stack: expect.stringContaining('DeprecationWarning: The old way is going away'),
        },
      }),
    ]);
    expect(records(output)[0]).not.toHaveProperty('source');
  });

  it('leaves the code out of a warning that has none', async () => {
    const { logger, output } = setup();
    restore = captureOutput(logger);

    process.emitWarning('Something looks odd');
    await nextTick();

    expect(records(output)[0]).toMatchObject({ event: 'process.warning', level: 'warn' });
    expect(records(output)[0]).not.toHaveProperty('code');
  });

  it('takes the place of every other listener for warnings, and gives it back', () => {
    const before = process.listeners('warning');
    const { logger } = setup();

    const undo = captureOutput(logger);
    const during = process.listeners('warning');
    undo();

    expect(during).toHaveLength(1);
    expect(before).not.toContain(during[0]);
    expect(process.listeners('warning')).toEqual(before);
  });

  it('puts console back as it was', () => {
    const before = {
      log: printer.log,
      error: printer.error,
      trace: printer.trace,
      dir: printer.dir,
    };
    const { logger, output } = setup();

    const undo = captureOutput(logger);
    const captured = printer.log;
    undo();

    expect(captured).not.toBe(before.log);
    expect({
      log: printer.log,
      error: printer.error,
      trace: printer.trace,
      dir: printer.dir,
    }).toEqual(before);
    expect(output.lines).toEqual([]);
  });

  it('captures once per process, however often it is called', () => {
    const { logger, output } = setup();
    const other = setup();

    restore = captureOutput(logger);
    const second = captureOutput(other.logger);
    printer.log('once');

    expect(second).toBe(restore);
    expect(output.lines).toHaveLength(1);
    expect(other.output.lines).toEqual([]);
  });

  it('can capture again after it was undone', () => {
    const first = setup();
    const second = setup();

    captureOutput(first.logger)();
    restore = captureOutput(second.logger);
    printer.log('again');

    expect(first.output.lines).toEqual([]);
    expect(second.output.lines).toHaveLength(1);
  });

  it('writes through the logger of the process when it is given none', () => {
    const { logger, output } = setup();
    vi.mocked(createProcessLogger).mockReturnValueOnce(logger);

    restore = captureOutput();
    printer.log('from a library');

    expect(records(output)).toEqual([
      expect.objectContaining({ service: 'toolkit-test', message: 'from a library' }),
    ]);
  });

  it('makes no second logger when the output is captured already', () => {
    const { logger } = setup();
    restore = captureOutput(logger);

    captureOutput();

    expect(createProcessLogger).not.toHaveBeenCalled();
  });
});
