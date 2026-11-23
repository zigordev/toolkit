import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import { type AddressInfo, createServer as createTcpServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

interface Attribute {
  readonly key: string;
  readonly value: { readonly stringValue?: string };
}

interface ExportedSpan {
  readonly name: string;
  readonly kind: number;
  readonly traceId: string;
  readonly attributes: readonly Attribute[];
}

const serverKind = 2;
const clientKind = 3;
const folder = fileURLToPath(new URL('..', import.meta.url));
const next = createRequire(import.meta.url).resolve('next/dist/bin/next');
let api: Server;
let receiver: Server;
let child: ChildProcess | undefined;
let bodies: { path: string; body: Record<string, unknown> }[];
let calls: { path: string; traceparent: string | undefined }[];

function listen(server: Server): Promise<void> {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
}

function address(server: Server): string {
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeEach(async () => {
  bodies = [];
  calls = [];
  api = createServer((request, response) => {
    const traceparent = request.headers.traceparent;
    calls.push({
      path: request.url ?? '',
      traceparent: typeof traceparent === 'string' ? traceparent : undefined,
    });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ message: 'Hello from the stand-in', status: 'ok' }));
  });
  receiver = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      bodies.push({
        path: request.url ?? '',
        body: JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>,
      });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{}');
    });
  });
  await Promise.all([listen(api), listen(receiver)]);
});

afterEach(async () => {
  child?.kill('SIGKILL');
  child = undefined;
  await Promise.all([
    new Promise((resolve) => api.close(resolve)),
    new Promise((resolve) => receiver.close(resolve)),
  ]);
});

async function freePort(): Promise<number> {
  const probe = createTcpServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function until(condition: () => boolean | Promise<boolean>, seconds: number): Promise<void> {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`gave up after ${seconds} seconds`);
}

interface Started {
  readonly base: string;
  readonly output: () => string;
  readonly errors: () => string;
  readonly stop: () => Promise<{ code: number | null; milliseconds: number }>;
}

async function start(env: Record<string, string>): Promise<Started> {
  expect(existsSync(join(folder, '.next', 'BUILD_ID')), 'run pnpm build first').toBe(true);
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const started = spawn(
    process.execPath,
    ['--import', '@zigordev/otel/register', next, 'start', '-p', String(port), '-H', '127.0.0.1'],
    {
      cwd: folder,
      env: {
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1',
        NEXT_OTEL_FETCH_DISABLED: '1',
        OTEL_EXPORTER_OTLP_ENDPOINT: address(receiver),
        OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
        OTEL_METRIC_EXPORT_INTERVAL: '500',
        API_URL: address(api),
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  child = started;
  let stdout = '';
  let stderr = '';
  started.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  started.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const exited = new Promise<number | null>((resolve) => started.on('exit', resolve));
  return {
    base,
    output: () => stdout,
    errors: () => stderr,
    stop: async () => {
      const asked = Date.now();
      started.kill('SIGTERM');
      const code = await exited;
      return { code, milliseconds: Date.now() - asked };
    },
  };
}

async function ready(server: Started): Promise<void> {
  const answering = (): Promise<boolean> =>
    fetch(`${server.base}/health`).then(
      (response) => response.ok,
      () => false
    );
  await until(answering, 20).catch(() => {
    throw new Error(`the web app did not get ready:\n${server.output()}\n${server.errors()}`);
  });
}

function jsonLines(output: string): Record<string, unknown>[] {
  return output
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function spans(): ExportedSpan[] {
  return bodies
    .filter((entry) => entry.path === '/v1/traces')
    .flatMap((entry) => entry.body.resourceSpans as { scopeSpans: { spans: ExportedSpan[] }[] }[])
    .flatMap((resource) => resource.scopeSpans.flatMap((scope) => scope.spans));
}

describe('the web app as a process', () => {
  it('shows what the API says, and answers its health route', async () => {
    const server = await start({ OTEL_SERVICE_NAME: 'template-web' });
    await ready(server);

    const page = await fetch(`${server.base}/`);
    const health = await fetch(`${server.base}/health`);

    expect(page.status).toBe(200);
    expect(await page.text()).toContain('Hello from the stand-in');
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({
      status: 'ok',
      service: 'template-web',
      components: { api: { status: 'up' } },
    });
  }, 60_000);

  it('carries the trace of a page into its call to the API', async () => {
    const server = await start({ OTEL_SERVICE_NAME: 'template-web' });
    await ready(server);

    await (await fetch(`${server.base}/`)).text();
    await until(() => spans().some((span) => span.kind === clientKind), 15);

    const page = spans().find((span) => span.kind === serverKind);
    const [call, ...others] = spans().filter((span) => span.kind === clientKind);
    const hello = calls.find((entry) => entry.path === '/api/v1/hello');
    expect(page?.name).toBe('GET /');
    expect(call?.traceId).toBe(page?.traceId);
    expect(others).toEqual([]);
    expect(hello?.traceparent).toContain(page?.traceId);
    expect(spans().filter((span) => span.name.includes('/health'))).toEqual([]);
  }, 60_000);

  it('writes service.started as a JSON line, with its name and version', async () => {
    const server = await start({
      OTEL_SERVICE_NAME: 'template-web',
      OTEL_SERVICE_VERSION: '1f3a9c2',
    });
    await ready(server);

    expect(jsonLines(server.output())).toContainEqual(
      expect.objectContaining({
        level: 'info',
        event: 'service.started',
        service: 'template-web',
        release: '1f3a9c2',
      })
    );
  }, 60_000);

  it('stops within seconds of a SIGTERM', async () => {
    const server = await start({ OTEL_SERVICE_NAME: 'template-web' });
    await ready(server);

    const stopped = await server.stop();

    expect(stopped.milliseconds).toBeLessThan(10_000);
    expect([0, 143]).toContain(stopped.code);
  }, 60_000);
});
