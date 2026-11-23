import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let server: Server;

beforeEach(async () => {
  server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  vi.stubEnv('OTEL_SERVICE_NAME', 'template-web');
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function health(apiUrl: string): Promise<{ status: number; body: unknown }> {
  vi.stubEnv('API_URL', apiUrl);
  const { GET } = await import('./route.ts');
  const response = await GET();
  return { status: response.status, body: await response.json() };
}

describe('GET /health', () => {
  it('answers 200 ok while the API is up', async () => {
    const answer = await health(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);

    expect(answer).toEqual({
      status: 200,
      body: { status: 'ok', service: 'template-web', components: { api: { status: 'up' } } },
    });
  });

  it('answers 200 degraded while the API is down, because the pages still render', async () => {
    const answer = await health('http://127.0.0.1:9');

    expect(answer).toEqual({
      status: 200,
      body: {
        status: 'degraded',
        service: 'template-web',
        components: { api: { status: 'down' } },
      },
    });
  });
});
