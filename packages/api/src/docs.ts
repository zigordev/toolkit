import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

export interface DocsTag {
  readonly name: string;
  readonly description: string;
}

export interface DocsOptions {
  readonly title: string;
  readonly description: string;
  readonly version: string;
  readonly tags?: readonly DocsTag[];
}

export const docsPath = '/api/v1/docs';
export const documentPath = '/api/v1/openapi.json';

export async function serveDocs(app: FastifyInstance, options: DocsOptions): Promise<void> {
  app.addHook('onRoute', (route) => {
    if (route.config?.public === true && route.schema !== undefined) {
      route.schema = { security: [], ...route.schema };
    }
  });
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: options.title, description: options.description, version: options.version },
      tags: (options.tags ?? []).map((tag) => ({ ...tag })),
      components: {
        securitySchemes: {
          bearer: { type: 'http', scheme: 'bearer' },
        },
      },
      security: [{ bearer: [] }],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: docsPath });
  app.get(
    documentPath,
    { config: { public: true }, schema: { hide: true } },
    async (_request, reply) => reply.serializer(JSON.stringify).send(app.swagger())
  );
}

export function openapiDocument(app: FastifyInstance): string {
  return `${JSON.stringify(app.swagger(), null, 2)}\n`;
}
