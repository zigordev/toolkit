import { type Logger, logStarted, logStopping, shutdownTelemetry } from '@zigordev/otel';
import type { FastifyInstance } from 'fastify';

export type Signal = 'SIGTERM' | 'SIGINT';

export interface ServeOptions {
  readonly port: number;
  readonly host: string;
  readonly logger: Logger;
  readonly stopTimeoutMs?: number;
}

export interface Server {
  readonly stop: (signal: Signal) => Promise<number>;
}

export interface Signals {
  once(signal: Signal, listener: () => void): unknown;
}

export const defaultStopTimeoutMs = 25_000;

const idleSweepMs = 50;

export async function serve(app: FastifyInstance, options: ServeOptions): Promise<Server> {
  await app.listen({ port: options.port, host: options.host });
  logStarted(options.logger, { port: options.port });
  const timeoutMs = options.stopTimeoutMs ?? defaultStopTimeoutMs;
  let stopping: Promise<number> | undefined;

  const closeWithin = async (): Promise<'closed' | 'timed out'> => {
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<'timed out'>((resolve) => {
      timer = setTimeout(() => resolve('timed out'), timeoutMs);
    });
    const sweep = setInterval(() => app.server.closeIdleConnections(), idleSweepMs);
    try {
      return await Promise.race([app.close().then(() => 'closed' as const), deadline]);
    } finally {
      clearInterval(sweep);
      clearTimeout(timer);
    }
  };

  const stop = (signal: Signal): Promise<number> => {
    stopping ??= (async () => {
      logStopping(options.logger, signal);
      try {
        if ((await closeWithin()) === 'timed out') {
          options.logger.error({ event: 'service.stop_timed_out', timeoutMs });
          return 1;
        }
        await shutdownTelemetry();
        return 0;
      } catch (error) {
        options.logger.error({ event: 'service.stop_failed', error });
        return 1;
      }
    })();
    return stopping;
  };
  return { stop };
}

export function stopOnSignals(
  server: Server,
  signals: Signals = process,
  exit: (code: number) => void = process.exit
): void {
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    signals.once(signal, () => {
      void server.stop(signal).then(exit);
    });
  }
}
