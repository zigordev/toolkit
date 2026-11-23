import { type Logger, logProcessCrashes, logStarted } from '@zigordev/otel';
import { getLogger } from './logger.ts';

function loggerOrStop(): Logger {
  try {
    return getLogger();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return process.exit(1);
  }
}

export function start(): void {
  const logger = loggerOrStop();
  logProcessCrashes(logger);
  logStarted(logger);
}
