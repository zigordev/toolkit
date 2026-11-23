import type { Env } from '@zigordev/config';
import {
  createLogger,
  type Logger,
  logProcessCrashes,
  logStarted,
  logStopping,
  shutdownTelemetry,
} from '@zigordev/otel';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.ts';
import { type Config, readConfig } from './config.ts';

export type Signal = 'SIGTERM' | 'SIGINT';

export interface StartOptions {
  readonly env?: Env;
  readonly logger?: Logger;
}

export interface Server {
  readonly app: FastifyInstance;
  readonly config: Config;
  readonly stop: (signal: Signal) => Promise<number>;
}

export interface Signals {
  once(signal: Signal, listener: () => void): unknown;
}

export async function start(options: StartOptions = {}): Promise<Server> {
  const config = readConfig(options.env);
  const logger =
    options.logger ??
    createLogger({
      service: config.OTEL_SERVICE_NAME,
      release: config.OTEL_SERVICE_VERSION,
      level: config.LOG_LEVEL,
    });
  const stopWatching = logProcessCrashes(logger);

  const app = await buildApp({ config, logger });
  await app.listen({ port: config.PORT, host: config.HOST });
  logStarted(logger, { port: config.PORT });

  const stop = async (signal: Signal): Promise<number> => {
    logStopping(logger, signal);
    try {
      await app.close();
      await shutdownTelemetry();
      return 0;
    } catch (error) {
      logger.error({ event: 'service.stop_failed', error });
      return 1;
    } finally {
      stopWatching();
    }
  };
  return { app, config, stop };
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
