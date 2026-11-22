import type { Logger } from '@zigordev/otel';
import Fastify, { type FastifyBaseLogger, type FastifyInstance, LogController } from 'fastify';
import type { Config } from './config.ts';
import { hello } from './features/hello/routes.ts';
import { health } from './plugins/health.ts';
import { nameRoutes } from './plugins/routes.ts';

export interface AppOptions {
  readonly config: Config;
  readonly logger: Logger;
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const service = options.config.OTEL_SERVICE_NAME;
  const loggerInstance: FastifyBaseLogger = options.logger;
  const app = Fastify({
    loggerInstance,
    logController: new LogController({ disableRequestLogging: true }),
  });
  nameRoutes(app);
  await app.register(health, { service });
  await app.register(hello, { prefix: '/api/v1', service });
  await app.ready();
  return app;
}
