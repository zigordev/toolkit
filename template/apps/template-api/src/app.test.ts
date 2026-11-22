import { createLogger } from '@zigordev/otel';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.ts';
import { readConfig } from './config.ts';

let app: FastifyInstance;
let lines: string[];

beforeEach(async () => {
  lines = [];
  const config = readConfig({ OTEL_SERVICE_NAME: 'template-api' });
  const logger = createLogger({
    service: config.OTEL_SERVICE_NAME,
    destination: { write: (line: string) => lines.push(line) },
  });
  app = await buildApp({ config, logger });
});

afterEach(async () => {
  await app.close();
});

function events(): unknown[] {
  return lines.map((line) => (JSON.parse(line) as { event?: string }).event);
}

describe('GET /health', () => {
  it('answers 200 ok with the name of the service', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', service: 'template-api', components: {} });
  });

  it('writes no log line', async () => {
    await app.inject({ method: 'GET', url: '/health' });

    expect(lines).toEqual([]);
  });
});

describe('GET /api/v1/hello', () => {
  it('answers 200 with a greeting, as JSON', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/hello' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.json()).toEqual({ message: 'Hello from template-api' });
  });

  it('writes the event greeting.sent, and no line per request', async () => {
    await app.inject({ method: 'GET', url: '/api/v1/hello' });

    expect(events()).toEqual(['greeting.sent']);
  });
});

describe('a path that no route matches', () => {
  it('answers 404', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/nothing' });

    expect(response.statusCode).toBe(404);
  });
});
