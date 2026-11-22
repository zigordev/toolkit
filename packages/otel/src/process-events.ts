import type { Logger } from 'pino';

export function logStarted(logger: Logger, fields: Record<string, unknown> = {}): void {
  logger.info({ event: 'service.started', runtime: `node ${process.version}`, ...fields });
}

export function logStopping(logger: Logger, signal: string): void {
  logger.info({ event: 'service.stopping', signal });
}

export function logProcessCrashes(logger: Logger): () => void {
  const listener = (error: Error, origin: string): void => {
    const event =
      origin === 'unhandledRejection'
        ? 'process.unhandled_rejection'
        : 'process.uncaught_exception';
    logger.error({ event, error });
  };
  process.on('uncaughtExceptionMonitor', listener);
  return () => {
    process.off('uncaughtExceptionMonitor', listener);
  };
}
