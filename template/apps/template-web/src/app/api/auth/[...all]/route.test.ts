import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let server: Server;
let seen: { method?: string; url?: string; cookie?: string; body: string }[] = [];

function bodyOf(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const parts: Buffer[] = [];
    request.on('data', (part: Buffer) => parts.push(part));
    request.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
  });
}

beforeEach(async () => {
  seen = [];
  server = createServer(async (request, response) => {
    seen.push({
      method: request.method,
      url: request.url,
      cookie: request.headers.cookie,
      body: await bodyOf(request),
    });
    response.writeHead(200, {
      'content-type': 'application/json',
      'set-cookie': 'template.session_token=abc; Path=/; HttpOnly',
    });
    response.end(JSON.stringify({ ok: true }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  vi.stubEnv('OTEL_SERVICE_NAME', 'template-web');
  vi.stubEnv('LOG_LEVEL', 'error');
  vi.stubEnv('API_URL', `http://127.0.0.1:${(server.address() as AddressInfo).port}`);
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  vi.unstubAllEnvs();
  vi.resetModules();
  Reflect.deleteProperty(globalThis, Symbol.for('zigordev.template-web.logger'));
});

describe('the sign-in routes of the web app', () => {
  it('forward a GET to the API, with its query, and pass the cookies back', async () => {
    const { GET } = await import('./route.ts');

    const response = await GET(
      new Request('http://localhost:3001/api/auth/get-session?disableRefresh=true', {
        headers: { cookie: 'a=1' },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual([
      'template.session_token=abc; Path=/; HttpOnly',
    ]);
    expect(seen).toEqual([
      { method: 'GET', url: '/api/auth/get-session?disableRefresh=true', cookie: 'a=1', body: '' },
    ]);
  });

  it('forward a POST to the API with its body', async () => {
    const { POST } = await import('./route.ts');

    await POST(
      new Request('http://localhost:3001/api/auth/sign-in/email', {
        method: 'POST',
        body: '{"email":"ada@example.com"}',
        headers: { 'content-type': 'application/json' },
      })
    );

    expect(seen).toEqual([
      expect.objectContaining({
        method: 'POST',
        url: '/api/auth/sign-in/email',
        body: '{"email":"ada@example.com"}',
      }),
    ]);
  });

  it('answers 502 while the API cannot be reached', async () => {
    vi.stubEnv('API_URL', 'http://127.0.0.1:9');
    const { GET } = await import('./route.ts');

    const response = await GET(new Request('http://localhost:3001/api/auth/ok'));

    expect(response.status).toBe(502);
  });
});
