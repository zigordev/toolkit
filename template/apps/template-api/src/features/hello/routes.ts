import { metrics } from '@opentelemetry/api';
import { createCounterAtZero } from '@zigordev/otel';
import type { FastifyInstance } from 'fastify';

export interface HelloOptions {
  readonly service: string;
}

const greeting = {
  type: 'object',
  properties: { message: { type: 'string' } },
  required: ['message'],
  additionalProperties: false,
} as const;

export async function hello(app: FastifyInstance, options: HelloOptions): Promise<void> {
  const greetings = createCounterAtZero(metrics.getMeter(options.service), 'template.greetings', {
    description: 'Greetings sent',
  });

  app.get('/hello', { schema: { response: { 200: greeting } } }, async (request) => {
    greetings.add(1);
    request.log.info({ event: 'greeting.sent' });
    return { message: `Hello from ${options.service}` };
  });
}
