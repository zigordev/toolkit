import { createLogger, type Logger } from '@zigordev/otel';
import { getConfig } from './config.ts';

const loggerKey = Symbol.for('zigordev.template-web.logger');

type LoggerHolder = typeof globalThis & { [loggerKey]?: Logger };

export function getLogger(): Logger {
  const holder = globalThis as LoggerHolder;
  if (holder[loggerKey] === undefined) {
    const config = getConfig();
    holder[loggerKey] = createLogger({
      service: config.OTEL_SERVICE_NAME,
      release: config.OTEL_SERVICE_VERSION,
      level: config.LOG_LEVEL,
    });
  }
  return holder[loggerKey];
}
