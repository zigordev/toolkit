import { format } from 'node:util';
import type { DiagLogger } from '@opentelemetry/api';
import type { ErrorHandler } from '@opentelemetry/core';
import type { Logger } from './logger.ts';

type Level = 'debug' | 'info' | 'warn' | 'error';

export interface Diagnostics {
  readonly logger: DiagLogger;
  readonly onError: ErrorHandler;
}

export function createDiagnostics(logger: Logger): Diagnostics {
  const lines = logger.child({ source: 'opentelemetry' });
  const write =
    (level: Level) =>
    (message: string, ...values: unknown[]): void => {
      const last = values.at(-1);
      if (last instanceof Error) {
        lines[level]({ error: last }, format(message, ...values.slice(0, -1)));
        return;
      }
      lines[level](format(message, ...values));
    };
  return {
    logger: {
      error: write('error'),
      warn: write('warn'),
      info: write('info'),
      debug: write('debug'),
      verbose: write('debug'),
    },
    onError: (failure) => {
      if (failure instanceof Error) {
        lines.error({ error: failure }, failure.message);
        return;
      }
      lines.error(format(failure));
    },
  };
}
