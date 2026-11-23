import { format, type InspectOptions, inspect } from 'node:util';
import { createProcessLogger, type Logger } from './logger.ts';

export type RestoreOutput = () => void;

const restoreKey = Symbol.for('zigordev.otel.output');

type OutputGlobal = typeof globalThis & { [restoreKey]?: RestoreOutput };

type Warning = Error & { readonly code?: string };

const levelOf = {
  debug: 'debug',
  log: 'info',
  info: 'info',
  warn: 'warn',
  error: 'error',
} as const;

type Method = keyof typeof levelOf;

export function captureOutput(given?: Logger): RestoreOutput {
  const holder = globalThis as OutputGlobal;
  const existing = holder[restoreKey];
  if (existing) {
    return existing;
  }
  const target: Console = globalThis.console;
  const logger = given ?? createProcessLogger();
  const lines = logger.child({ source: 'console' });
  const original = {
    debug: target.debug,
    log: target.log,
    info: target.info,
    warn: target.warn,
    error: target.error,
    trace: target.trace,
    dir: target.dir,
  };
  for (const method of Object.keys(levelOf) as Method[]) {
    target[method] = (...values: unknown[]): void => {
      lines[levelOf[method]](format(...values));
    };
  }
  target.trace = function trace(...values: unknown[]): void {
    const held = { name: 'Trace', message: format(...values), stack: '' };
    Error.captureStackTrace(held, trace);
    lines.debug(held.stack);
  };
  target.dir = (value: unknown, options?: InspectOptions): void => {
    lines.info(inspect(value, options));
  };

  const previous = process.listeners('warning');
  const onWarning = (warning: Warning): void => {
    logger.warn({
      event: 'process.warning',
      ...(warning.code ? { code: warning.code } : {}),
      error: warning,
    });
  };
  process.removeAllListeners('warning');
  process.on('warning', onWarning);

  const restore: RestoreOutput = () => {
    Object.assign(target, original);
    process.off('warning', onWarning);
    for (const listener of previous) {
      process.on('warning', listener);
    }
    delete holder[restoreKey];
  };
  holder[restoreKey] = restore;
  return restore;
}
