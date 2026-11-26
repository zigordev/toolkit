import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let api: Server;
let seen: { method: string; path: string; cookie: string | undefined }[];

beforeEach(async () => {
  seen = [];
  api = createServer((request, response) => {
    seen.push({
      method: request.method ?? '',
      path: request.url ?? '',
      cookie: request.headers.cookie,
    });
    response.writeHead(201, { 'content-type': 'application/json' });
    response.end('{"id":"1"}');
  });
  await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve));
  vi.stubEnv('OTEL_SERVICE_NAME', 'template-web');
  vi.stubEnv('LOG_LEVEL', 'error');
  vi.stubEnv('API_URL', `http://127.0.0.1:${(api.address() as AddressInfo).port}`);
});

afterEach(async () => {
  await new Promise((resolve) => api.close(resolve));
  vi.unstubAllEnvs();
  vi.resetModules();
  Reflect.deleteProperty(globalThis, Symbol.for('zigordev.template-web.logger'));
});

describe('the API forwarder of the dev server', () => {
  it('hands each request under /api/v1 to the API, with its cookie, and gives back the answer', async () => {
    const route = await import('./route.ts');

    const response = await route.POST(
      new Request('http://localhost:3001/api/v1/notes?x=1', {
        method: 'POST',
        headers: { cookie: 'template.session_token=abc', 'content-type': 'application/json' },
        body: '{"title":"Buy milk"}',
      })
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: '1' });
    expect(seen).toEqual([
      { method: 'POST', path: '/api/v1/notes?x=1', cookie: 'template.session_token=abc' },
    ]);
    expect([route.GET, route.PATCH, route.DELETE]).toEqual([route.POST, route.POST, route.POST]);
  });
});
