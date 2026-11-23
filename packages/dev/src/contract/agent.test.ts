import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import {
  type AddressInfo,
  createServer as createTcpServer,
  type Server as TcpServer,
} from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { ask, hold, main, serve, visitorHeaders } from './agent.ts';

const open: (Server | TcpServer)[] = [];
let folder: string | undefined;

function portOf(server: Server | TcpServer): number {
  return (server.address() as AddressInfo).port;
}

async function agent(): Promise<{ port: number; url: string }> {
  const server = await serve(0, '127.0.0.1');
  open.push(server);
  return { port: portOf(server), url: `http://127.0.0.1:${portOf(server)}` };
}

async function app(
  answer: (headers: Record<string, unknown>) => { status: number; body: string }
): Promise<number> {
  const server = createServer((request, response) => {
    const { status, body } = answer(request.headers);
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(body);
  });
  open.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return portOf(server);
}

afterEach(async () => {
  await Promise.all(
    open.splice(0).map((server) => new Promise((resolve) => server.close(resolve)))
  );
  if (folder !== undefined) {
    rmSync(folder, { recursive: true, force: true });
    folder = undefined;
  }
});

describe('the stand-in for the telemetry agent', () => {
  it('takes what an app sends, and says which of the texts it is asked about each one holds', async () => {
    const { url } = await agent();

    await fetch(`${url}/v1/traces`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ service: 'gpool-api', path: '/pools' }),
    });
    await fetch(`${url}/v1/metrics?batch=1`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-protobuf' },
      body: Buffer.from('\u0000\u0001gpool-web\u0002'),
    });
    const summary = await fetch(`${url}/__received?sought=gpool-api&sought=gpool-web&sought=ada`);

    expect(await summary.json()).toEqual([
      { path: '/v1/traces', type: 'application/json', found: ['gpool-api'] },
      { path: '/v1/metrics', type: 'application/x-protobuf', found: ['gpool-web'] },
    ]);
  });

  it('answers JSON with JSON, and anything else with an empty body, as the agent does', async () => {
    const { url } = await agent();

    const json = await fetch(`${url}/v1/traces`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const binary = await fetch(`${url}/v1/traces`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-protobuf' },
      body: Buffer.from([1, 2, 3]),
    });
    const bare = await fetch(`${url}/v1/traces`, { method: 'POST', body: Buffer.from([1]) });

    expect([json.status, await json.text()]).toEqual([200, '{}']);
    expect([binary.status, await binary.text()]).toEqual([200, '']);
    expect([bare.status, await bare.text()]).toEqual([200, '']);
  });

  it('knows no other request', async () => {
    const { url } = await agent();

    expect((await fetch(`${url}/anything`)).status).toBe(404);
    expect((await fetch(`${url}/__received`, { method: 'DELETE' })).status).toBe(404);
  });
});

describe('ask', () => {
  it('gives the status and the body of an answer', async () => {
    const port = await app(() => ({ status: 503, body: '{"status":"error"}' }));

    expect(await ask(`http://127.0.0.1:${port}/health`)).toEqual({
      status: 503,
      body: '{"status":"error"}',
    });
  });

  it('sends the headers it is given', async () => {
    const port = await app((headers) => ({
      status: 200,
      body: `${String(headers['user-agent'])} from ${String(headers['x-forwarded-for'])}`,
    }));

    expect((await ask(`http://127.0.0.1:${port}/`, visitorHeaders)).body).toBe(
      'contract-visitor/1.0 from 203.0.113.9'
    );
  });

  it('gives the status 0 and the reason when nothing answers', async () => {
    const answer = await ask('http://127.0.0.1:1/health');

    expect(answer.status).toBe(0);
    expect(answer.body).not.toBe('');
  });
});

describe('hold', () => {
  it('begins a request, finishes it later, and gives the first line of the answer', async () => {
    const port = await app(() => ({ status: 200, body: '{"status":"ok"}' }));
    const order: string[] = [];

    const held = await hold('127.0.0.1', port, 150, () => order.push('sent'));
    order.push('answered');

    expect(held).toEqual({ response: 'HTTP/1.1 200 OK' });
    expect(order).toEqual(['sent', 'answered']);
  });

  it('says so when the connection is closed before an answer came', async () => {
    const server = createTcpServer((socket) => {
      socket.on('data', () => socket.end());
    });
    open.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

    expect(await hold('127.0.0.1', portOf(server), 500)).toEqual({
      failure: 'the connection was closed before an answer came',
    });
  });

  it('gives the reason when nothing listens there', async () => {
    const held = await hold('127.0.0.1', 1, 50);

    expect(held.response).toBeUndefined();
    expect(held.failure).toContain('ECONNREFUSED');
  });
});

describe('the script, as the test runs it inside the network', () => {
  it('asks, as a visitor when told so, and prints the answer as JSON', async () => {
    const port = await app((headers) => ({ status: 200, body: String(headers['user-agent']) }));
    let printed = '';

    const code = await main(['ask', `http://127.0.0.1:${port}/`, 'visitor'], (text) => {
      printed += text;
    });
    const plain = await ask(`http://127.0.0.1:${port}/`);

    expect(code).toBe(0);
    expect(JSON.parse(printed)).toEqual({ status: 200, body: 'contract-visitor/1.0' });
    expect(plain.body).not.toBe('contract-visitor/1.0');
  });

  it('serves, and prints what it received with the texts that were sought', async () => {
    let port = 0;
    await main(
      ['serve', '0'],
      () => undefined,
      (server) => {
        open.push(server);
        port = portOf(server);
      }
    );
    await fetch(`http://127.0.0.1:${port}/v1/traces`, { method: 'POST', body: 'from gpool-api' });
    let printed = '';

    const code = await main(['received', String(port), 'gpool-api', 'ada'], (text) => {
      printed += text;
    });

    expect(code).toBe(0);
    expect(JSON.parse(printed)).toEqual([
      { path: '/v1/traces', type: 'text/plain;charset=UTF-8', found: ['gpool-api'] },
    ]);
  });

  it('holds a request, and leaves a file when it is sent and one with the outcome', async () => {
    const port = await app(() => ({ status: 200, body: '{}' }));
    folder = mkdtempSync(join(tmpdir(), 'zigordev-agent-'));
    const file = join(folder, 'held.json');

    const code = await main(['hold', '127.0.0.1', String(port), '100', file], () => undefined);

    expect(code).toBe(0);
    expect(existsSync(`${file}.sent`)).toBe(true);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ response: 'HTTP/1.1 200 OK' });
  });

  it('explains itself on a command it does not know', async () => {
    let printed = '';

    const code = await main(['dance'], (text) => {
      printed += text;
    });

    expect(code).toBe(2);
    expect(printed).toContain('Usage: agent serve <port>');
  });

  it('runs as a file of its own under Node.js, with nothing installed beside it', async () => {
    const port = await app(() => ({ status: 200, body: 'hello' }));
    const script = fileURLToPath(new URL('./agent.ts', import.meta.url));
    folder = mkdtempSync(join(tmpdir(), 'zigordev-agent-'));

    const result = await new Promise<{ failed: boolean; stdout: string }>((resolve) => {
      execFile(
        process.execPath,
        [script, 'ask', `http://127.0.0.1:${port}/`],
        { cwd: folder, timeout: 20_000 },
        (error, stdout) => resolve({ failed: error !== null, stdout })
      );
    });

    expect(result.failed).toBe(false);
    expect(JSON.parse(result.stdout)).toEqual({ status: 200, body: 'hello' });
  });
});
