import { checkHealth } from '@zigordev/otel';
import type { FastifyInstance } from 'fastify';

export interface HealthOptions {
  readonly service: string;
}

export async function health(app: FastifyInstance, options: HealthOptions): Promise<void> {
  app.get('/health', async (_request, reply) => {
    const report = await checkHealth({ service: options.service, components: [] });
    return reply.code(report.statusCode).send(report.body);
  });
}
