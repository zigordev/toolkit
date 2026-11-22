import { nameRoute } from '@zigordev/otel';
import type { FastifyInstance } from 'fastify';

export function nameRoutes(app: FastifyInstance): void {
  app.addHook('onRequest', async (request) => {
    const route = request.routeOptions.url;
    if (route !== undefined) {
      nameRoute(route);
    }
  });
}
