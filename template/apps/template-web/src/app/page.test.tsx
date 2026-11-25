import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let server: Server;

beforeEach(async () => {
  server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ message: 'Hello from the stand-in' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  vi.stubEnv('OTEL_SERVICE_NAME', 'template-web');
  vi.stubEnv('LOG_LEVEL', 'error');
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  vi.unstubAllEnvs();
  vi.resetModules();
  Reflect.deleteProperty(globalThis, Symbol.for('zigordev.template-web.logger'));
});

async function render(apiUrl: string): Promise<string> {
  vi.stubEnv('API_URL', apiUrl);
  const { default: Home } = await import('./page.tsx');
  return renderToStaticMarkup(await Home());
}

describe('the home page', () => {
  it('shows what the API says', async () => {
    const html = await render(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);

    expect(html).toBe(
      '<main><h1>Template</h1><p>Hello from the stand-in</p><p><a href="/account">Your account</a></p></main>'
    );
  });

  it('still renders when the API does not answer', async () => {
    const html = await render('http://127.0.0.1:9');

    expect(html).toBe(
      '<main><h1>Template</h1><p>The API does not answer.</p><p><a href="/account">Your account</a></p></main>'
    );
  });
});
