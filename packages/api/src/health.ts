import { checkHealth, type HealthComponent } from '@zigordev/otel';
import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    healthComponents: HealthComponent[];
  }
}

export function serveHealth(
  app: FastifyInstance,
  service: string,
  components: readonly HealthComponent[]
): void {
  app.decorate('healthComponents', [...components]);
  app.get(
    '/health',
    { config: { public: true, rateLimit: false }, schema: { hide: true } },
    async (_request, reply) => {
      const report = await checkHealth({ service, components: app.healthComponents });
      return reply.code(report.statusCode).serializer(JSON.stringify).send(report.body);
    }
  );
}

export function addHealthComponent(app: FastifyInstance, component: HealthComponent): void {
  if (app.healthComponents.some((existing) => existing.name === component.name)) {
    throw new Error(`The health route already has a component named ${component.name}`);
  }
  app.healthComponents.push(component);
}
