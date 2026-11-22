import {
  createLogger,
  logProcessCrashes,
  logStarted,
  logStopping,
  shutdownTelemetry,
} from '@zigordev/otel';
import { buildApp } from './app.ts';
import { readConfig } from './config.ts';

const config = readConfig();
const logger = createLogger({
  service: config.OTEL_SERVICE_NAME,
  release: config.OTEL_SERVICE_VERSION,
  level: config.LOG_LEVEL,
});
logProcessCrashes(logger);

const app = await buildApp({ config, logger });
await app.listen({ port: config.PORT, host: config.HOST });
logStarted(logger, { port: config.PORT });

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    logStopping(logger, signal);
    app
      .close()
      .then(shutdownTelemetry)
      .then(
        () => process.exit(0),
        (error: unknown) => {
          logger.error({ event: 'service.stop_failed', error });
          process.exit(1);
        }
      );
  });
}
