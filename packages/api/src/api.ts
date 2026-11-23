import { type HealthComponent, type Logger, nameRoute } from '@zigordev/otel';
import Fastify, { type FastifyBaseLogger, LogController } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { type Authenticate, requireSignIn } from './auth.ts';
import { type DocsOptions, serveDocs } from './docs.ts';
import { handleErrors } from './errors.ts';
import { serveHealth } from './health.ts';

export interface ApiOptions {
  readonly service: string;
  readonly logger: Logger;
  readonly docs: DocsOptions;
  readonly health?: readonly HealthComponent[];
  readonly authenticate?: Authenticate;
  readonly bodyLimit?: number;
}

export async function createApi(options: ApiOptions) {
  const loggerInstance: FastifyBaseLogger = options.logger;
  const app = Fastify({
    loggerInstance,
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: options.bodyLimit ?? 1024 * 1024,
  }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.removeContentTypeParser('text/plain');
  handleErrors(app);
  app.addHook('onRequest', async (request) => {
    const route = request.routeOptions.url;
    if (route !== undefined) {
      nameRoute(route);
    }
  });
  requireSignIn(app, options.authenticate);
  await serveDocs(app, options.docs);
  serveHealth(app, options.service, options.health ?? []);
  return app;
}

export type Api = Awaited<ReturnType<typeof createApi>>;
