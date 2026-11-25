import { randomUUID } from 'node:crypto';
import { createLogger } from '@zigordev/otel';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { afterAll, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest';
import * as z from 'zod';
import { type Api, type ApiOptions, createApi } from './api.ts';
import { bearerToken, type Principal, principalOf, requireScope } from './auth.ts';
import { openapiDocument } from './docs.ts';
import { addHealthComponent } from './health.ts';
import { decodeCursor, listQuery, pageOf, pageSchema, parseSort } from './pagination.ts';
import { notFound, ProblemError, problemResponses } from './problems.ts';

const readerToken = randomUUID();
const writerToken = randomUUID();
const principals = new Map<string, Principal>([
  [readerToken, { id: 'reader', scopes: ['things:read'] }],
  [writerToken, { id: 'writer', scopes: ['things:read', 'things:write'] }],
]);

interface Thing {
  readonly id: string;
  readonly name: string;
  readonly color: 'red' | 'blue';
  readonly createdAt: string;
  readonly secret?: string;
}

const thing = z.object({
  id: z.uuid(),
  name: z.string(),
  color: z.enum(['red', 'blue']),
  createdAt: z.iso.datetime(),
});

const things: Thing[] = Array.from({ length: 45 }, (_, index) => ({
  id: randomUUID(),
  name: `thing ${String(index).padStart(2, '0')}`,
  color: index % 3 === 0 ? 'red' : 'blue',
  createdAt: new Date(Date.UTC(2026, 10, 1, 0, index)).toISOString(),
  secret: 'never in an answer',
}));

const listThings = listQuery({
  filters: { color: z.enum(['red', 'blue']).optional() },
  sort: ['name', 'createdAt'],
  defaultSort: 'name',
});

const feature: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '',
    {
      schema: {
        summary: 'List the things',
        tags: ['things'],
        operationId: 'listThings',
        querystring: listThings,
        response: { 200: pageSchema(thing), ...problemResponses(400, 401, 403) },
      },
    },
    async (request) => {
      requireScope(request, 'things:read');
      const { sort, limit, cursor, color } = request.query;
      const { field, direction } = parseSort(sort);
      const ordered = things
        .filter((item) => color === undefined || item.color === color)
        .toSorted((a, b) => a[field].localeCompare(b[field]) * (direction === 'asc' ? 1 : -1));
      const after = cursor === undefined ? undefined : decodeCursor(cursor, sort, 2);
      const start = after === undefined ? 0 : ordered.findIndex((item) => item.id === after[1]) + 1;
      return pageOf(ordered.slice(start, start + limit + 1), limit, sort, (item) => [
        item[field],
        item.id,
      ]);
    }
  );

  app.get(
    '/:thingId',
    {
      schema: {
        summary: 'Get one thing',
        tags: ['things'],
        operationId: 'getThing',
        params: z.strictObject({ thingId: z.uuid() }),
        response: { 200: thing, ...problemResponses(400, 401, 404) },
      },
    },
    async (request) => {
      const found = things.find((item) => item.id === request.params.thingId);
      if (found === undefined) {
        throw notFound('thing.not_found', 'No thing has this id.', {
          thingId: request.params.thingId,
        });
      }
      return found;
    }
  );

  app.post(
    '',
    {
      schema: {
        summary: 'Create a thing',
        tags: ['things'],
        operationId: 'createThing',
        body: z.strictObject({
          name: z.string().min(1).max(100),
          color: z.enum(['red', 'blue']),
        }),
        response: { 201: thing, ...problemResponses(400, 401, 403) },
      },
    },
    async (request, reply) => {
      const principal = requireScope(request, 'things:write');
      const created: Thing = {
        id: randomUUID(),
        ...request.body,
        createdAt: new Date().toISOString(),
      };
      request.log.info({ event: 'thing.created', by: principal.id });
      return reply.code(201).header('location', `/api/v1/things/${created.id}`).send(created);
    }
  );

  app.get('/boom', { schema: { hide: true } }, async () => {
    throw new Error('the database said no at line 42');
  });

  app.get('/teapot', { schema: { hide: true } }, async () => {
    throw new ProblemError({
      status: 409,
      code: 'thing.busy',
      detail: 'The thing is busy.',
      headers: { 'retry-after': '5' },
    });
  });

  app.get(
    '/open',
    {
      config: { public: true },
      schema: {
        summary: 'A public thing',
        tags: ['things'],
        operationId: 'getOpenThing',
        response: { 200: z.object({ principal: z.string() }) },
      },
    },
    async (request) => ({ principal: request.principal?.id ?? 'nobody' })
  );

  app.get('/whoami', { schema: { hide: true } }, async (request) => ({
    id: principalOf(request).id,
  }));

  app.get(
    '/open/whoami',
    { config: { public: true }, schema: { hide: true } },
    async (request) => ({
      id: principalOf(request).id,
    })
  );
};

let lines: string[];

async function build(overrides: Partial<ApiOptions> = {}): Promise<Api> {
  lines = [];
  const app = await createApi({
    service: 'things-api',
    logger: createLogger({
      service: 'things-api',
      destination: { write: (line: string) => lines.push(line) },
    }),
    docs: {
      title: 'Things API',
      description: 'A small API to try the base on',
      version: '1.0.0',
      tags: [{ name: 'things', description: 'Things to list and create' }],
    },
    authenticate: (request) => principals.get(bearerToken(request) ?? ''),
    ...overrides,
  });
  await app.register(feature, { prefix: '/api/v1/things' });
  await app.ready();
  return app;
}

function events(): unknown[] {
  return lines.map((line) => (JSON.parse(line) as { event?: unknown }).event);
}

const asReader = { authorization: `Bearer ${readerToken}` };
const asWriter = { authorization: `Bearer ${writerToken}` };

let app: Api;

beforeAll(async () => {
  app = await build();
});

afterAll(async () => {
  await app.close();
});

describe('the error format', () => {
  it('answers a path that no route matches with a 404 problem, before any sign-in', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/nothing?x=1' });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toBe('application/problem+json; charset=utf-8');
    expect(response.json()).toEqual({
      type: 'https://zigordev.com/problems/route-not-found',
      title: 'Not found',
      status: 404,
      detail: 'No route matches GET /api/v1/nothing.',
      instance: '/api/v1/nothing',
      code: 'route.not_found',
      params: {},
    });
  });

  it('lists every invalid field of a body, with where it is and why', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/things',
      headers: asWriter,
      payload: { name: '', color: 'green', size: 3 },
    });

    expect(response.statusCode).toBe(400);
    const problem = response.json();
    expect(problem).toMatchObject({
      code: 'request.invalid',
      status: 400,
      instance: '/api/v1/things',
      detail: '3 fields of the request are invalid. params.errors names each one.',
    });
    expect(problem.params.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ in: 'body', pointer: '/name', code: 'too_small' }),
        expect.objectContaining({ in: 'body', pointer: '/color', code: 'invalid_value' }),
        expect.objectContaining({ in: 'body', pointer: '/size', code: 'unrecognized_key' }),
      ])
    );
    expect(problem.params.errors).toHaveLength(3);
  });

  it('names one invalid field in the singular', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/things/not-a-uuid',
      headers: asReader,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().detail).toBe(
      'One field of the request is invalid. params.errors names it.'
    );
    expect(response.json().params.errors).toEqual([
      expect.objectContaining({ in: 'params', pointer: '/thingId' }),
    ]);
  });

  it('answers a body that is not JSON with a 400 problem', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/things',
      headers: { ...asWriter, 'content-type': 'application/json' },
      payload: '{"name":',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'request.malformed' });
  });

  it('accepts JSON only, and answers plain text with 415', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/things',
      headers: { ...asWriter, 'content-type': 'text/plain' },
      payload: 'a thing',
    });

    expect(response.statusCode).toBe(415);
    expect(response.json()).toMatchObject({ code: 'request.unsupported_media_type' });
  });

  it('answers a body over the limit with 413', async () => {
    const small = await build({ bodyLimit: 64 });
    const response = await small.inject({
      method: 'POST',
      url: '/api/v1/things',
      headers: asWriter,
      payload: { name: 'x'.repeat(100), color: 'red' },
    });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({ code: 'request.too_large' });
    await small.close();
  });

  it('answers a failure with a 500 problem that tells nothing of its cause, and logs the cause', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/things/boom',
      headers: asReader,
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual(
      expect.objectContaining({
        code: 'server.error',
        detail: 'The service could not complete the request.',
      })
    );
    expect(response.body).not.toContain('line 42');
    const failed = lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((line) => line.event === 'request.failed');
    expect(failed).toMatchObject({
      level: 'error',
      method: 'GET',
      route: '/api/v1/things/boom',
      statusCode: 500,
      error: expect.objectContaining({ message: 'the database said no at line 42' }),
    });
  });

  it('sends the status, the code and the headers of a problem that a route throws', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/things/teapot',
      headers: asReader,
    });

    expect(response.statusCode).toBe(409);
    expect(response.headers['retry-after']).toBe('5');
    expect(response.json()).toMatchObject({ code: 'thing.busy', title: 'Conflict' });
  });

  it('answers a missing resource with its own code and params', async () => {
    const thingId = randomUUID();
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/things/${thingId}`,
      headers: asReader,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      code: 'thing.not_found',
      params: { thingId },
      instance: `/api/v1/things/${thingId}`,
    });
  });

  it('drops any field that the response schema does not list', async () => {
    const [first] = things;
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/things/${first?.id}`,
      headers: asReader,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).not.toHaveProperty('secret');
  });
});

describe('sign-in', () => {
  it('answers a request without credentials with 401 and asks for a bearer token', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/things' });

    expect(response.statusCode).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
    expect(response.json()).toMatchObject({ code: 'auth.unauthenticated' });
  });

  it.each([
    ['an unknown token', `Bearer ${randomUUID()}`],
    ['another scheme', `Basic ${readerToken}`],
    ['an empty token', 'Bearer '],
  ])('answers %s with 401', async (_name, authorization) => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/things',
      headers: { authorization },
    });

    expect(response.statusCode).toBe(401);
  });

  it('checks the credentials before the request, so a bad request without them is a 401', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/v1/things', payload: {} });

    expect(response.statusCode).toBe(401);
  });

  it('checks the credentials before it reads the body, so a broken body without them is a 401', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/things',
      headers: { 'content-type': 'application/json' },
      payload: '{"name":',
    });

    expect(response.statusCode).toBe(401);
  });

  it('answers with 403 when the credentials lack the scope, and names the scope', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/things',
      headers: asReader,
      payload: { name: 'new', color: 'red' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      code: 'auth.forbidden',
      params: { scope: 'things:write' },
    });
  });

  it('lets a route marked public answer without credentials', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/things/open' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ principal: 'nobody' });
  });

  it('gives the route the principal it signed in as', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/things/whoami',
      headers: asWriter,
    });

    expect(response.json()).toEqual({ id: 'writer' });
  });

  it('answers 401 when a public route asks who signed in, and nobody did', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/things/open/whoami' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'auth.unauthenticated' });
  });

  it('creates with 201 and a Location header when the scope is there', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/things',
      headers: asWriter,
      payload: { name: 'new', color: 'red' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers.location).toBe(`/api/v1/things/${response.json().id}`);
    expect(events()).toContain('thing.created');
  });

  it('refuses every route that is not public when the API has no way to sign in', async () => {
    const closed = await build({ authenticate: undefined });

    const things = await closed.inject({
      method: 'GET',
      url: '/api/v1/things',
      headers: asReader,
    });
    const health = await closed.inject({ method: 'GET', url: '/health' });

    expect(things.statusCode).toBe(401);
    expect(health.statusCode).toBe(200);
    await closed.close();
  });
});

describe('paging', () => {
  async function list(query: string) {
    return app.inject({ method: 'GET', url: `/api/v1/things${query}`, headers: asReader });
  }

  it('answers 20 items by default, sorted by the default field, with a cursor for more', async () => {
    const response = await list('');

    expect(response.statusCode).toBe(200);
    const page = response.json();
    expect(page.items).toHaveLength(20);
    expect(page.items[0].name).toBe('thing 00');
    expect(typeof page.nextCursor).toBe('string');
  });

  it('walks every item once, and the last page has no cursor', async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const query = cursor === undefined ? '?limit=20' : `?limit=20&cursor=${cursor}`;
      const page = (await list(query)).json() as { items: Thing[]; nextCursor?: string };
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor !== undefined);

    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(45);
  });

  it('sorts descending with a minus before the field', async () => {
    const page = (await list('?sort=-createdAt&limit=2')).json();

    expect(page.items.map((item: Thing) => item.name)).toEqual(['thing 44', 'thing 43']);
  });

  it('filters by a field', async () => {
    const page = (await list('?color=red&limit=100')).json();

    expect(page.items).toHaveLength(15);
    expect(page.items.every((item: Thing) => item.color === 'red')).toBe(true);
    expect(page).not.toHaveProperty('nextCursor');
  });

  it.each([
    ['a limit over 100', '?limit=101', '/limit'],
    ['a limit of 0', '?limit=0', '/limit'],
    ['an unknown sort field', '?sort=-weight', '/sort'],
    ['an unknown filter', '?size=3', '/size'],
  ])('answers %s with 400 and names the field', async (_name, query, pointer) => {
    const response = await list(query);

    expect(response.statusCode).toBe(400);
    expect(response.json().params.errors).toEqual([
      expect.objectContaining({ in: 'querystring', pointer }),
    ]);
  });

  it('refuses a cursor that another sort order gave out', async () => {
    const byName = (await list('?limit=2')).json();

    const response = await list(`?limit=2&sort=createdAt&cursor=${byName.nextCursor}`);

    expect(response.statusCode).toBe(400);
    expect(response.json().params.errors).toEqual([
      expect.objectContaining({ pointer: '/cursor', code: 'invalid_cursor' }),
    ]);
  });
});

describe('the OpenAPI pages', () => {
  it('serves the OpenAPI 3.1 document, without sign-in', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/openapi.json' });

    expect(response.statusCode).toBe(200);
    const document = response.json();
    expect(document.openapi).toBe('3.1.0');
    expect(document.info).toEqual({
      title: 'Things API',
      description: 'A small API to try the base on',
      version: '1.0.0',
    });
    expect(document.security).toEqual([{ bearer: [] }]);
    expect(document.components.securitySchemes.bearer).toEqual({
      type: 'http',
      scheme: 'bearer',
    });
  });

  it('describes every route with its summary, tags and operation id', async () => {
    const document = (await app.inject({ method: 'GET', url: '/api/v1/openapi.json' })).json();
    const operations = Object.values(document.paths).flatMap((path) =>
      Object.values(path as Record<string, { operationId: string }>)
    );

    expect(operations.map((operation) => operation.operationId).sort()).toEqual([
      'createThing',
      'getOpenThing',
      'getThing',
      'listThings',
    ]);
    expect(document.paths['/api/v1/things'].get).toMatchObject({
      summary: 'List the things',
      tags: ['things'],
    });
  });

  it('marks a public route as needing no credentials, and leaves out the hidden ones', async () => {
    const document = (await app.inject({ method: 'GET', url: '/api/v1/openapi.json' })).json();

    expect(document.paths['/api/v1/things/open'].get.security).toEqual([]);
    expect(document.paths['/api/v1/things'].get.security).toBeUndefined();
    expect(document.paths).not.toHaveProperty('/health');
    expect(document.paths).not.toHaveProperty('/api/v1/things/boom');
  });

  it('documents the problem answers of a route', async () => {
    const document = (await app.inject({ method: 'GET', url: '/api/v1/openapi.json' })).json();
    const responses = document.paths['/api/v1/things'].post.responses;

    expect(Object.keys(responses).sort()).toEqual(['201', '400', '401', '403']);
    expect(responses['403'].description).toBe('The credentials do not allow this request.');
  });

  it('serves Swagger UI at /api/v1/docs, without sign-in', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/docs' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
  });

  it('writes the document as the committed file holds it: two spaces, one final newline', async () => {
    const text = openapiDocument(app);

    expect(text.endsWith('}\n')).toBe(true);
    expect(JSON.parse(text)).toEqual(app.swagger());
    expect(text).toContain('\n  "openapi": "3.1.0"');
  });
});

describe('the health route', () => {
  it('answers 200 ok at the root, with its version, without sign-in, and writes no log line', async () => {
    vi.stubEnv('OTEL_SERVICE_VERSION', '1f3a9c2');
    onTestFinished(() => {
      vi.unstubAllEnvs();
    });
    lines.length = 0;
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.json()).toEqual({
      status: 'ok',
      service: 'things-api',
      version: '1f3a9c2',
      components: {},
    });
    expect(lines).toEqual([]);
  });

  it('answers 200 degraded when a part that is not required is down', async () => {
    const degraded = await build({
      health: [{ name: 'cache', required: false, check: () => 'down' }],
    });

    const response = await degraded.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'degraded',
      components: { cache: { status: 'down' } },
    });
    await degraded.close();
  });

  it('answers 503 error when a required part is down, also one added later', async () => {
    const failing = await build();
    addHealthComponent(failing, { name: 'db', required: true, check: () => 'down' });

    const response = await failing.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: 'error',
      components: { db: { status: 'down' } },
    });
    expect(() =>
      addHealthComponent(failing, { name: 'db', required: true, check: () => 'up' })
    ).toThrow('already has a component named db');
    await failing.close();
  });
});
