import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

interface Export {
  readonly path: string;
  readonly contentType: string;
  readonly body: Buffer;
}

interface Attribute {
  readonly key: string;
  readonly value: { readonly stringValue?: string; readonly intValue?: string | number };
}

interface ExportedSpan {
  readonly name: string;
  readonly kind: number;
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly attributes: readonly Attribute[];
}

interface ResourceSpans {
  readonly resource: { readonly attributes: readonly Attribute[] };
  readonly scopeSpans: readonly { readonly spans: readonly ExportedSpan[] }[];
}

interface Run {
  readonly stderr: string;
  readonly stdout: string;
  readonly lines: readonly Record<string, unknown>[];
  readonly health: { readonly status: number; readonly body: unknown };
}

const serverKind = 2;
const clientKind = 3;
const visitor = {
  address: '203.0.113.9',
  email: 'ada@example.com',
  agent: 'e2e-agent/1.0',
  code: 'code-51ac',
};
const personal = [visitor.address, visitor.email, 'ada%40example.com', visitor.agent, visitor.code];
const hidden = randomUUID();

const source = dirname(fileURLToPath(import.meta.url));
const resolve = createRequire(import.meta.url).resolve;
const api = pathToFileURL(resolve('@opentelemetry/api')).href;
const pg = pathToFileURL(resolve('pg')).href;
let dir: string;
let receiver: Server;
let exports: Export[];

function read(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'zigordev-otel-'));
  exports = [];
  receiver = createServer(async (request, response) => {
    exports.push({
      path: request.url ?? '',
      contentType: request.headers['content-type'] ?? '',
      body: await read(request),
    });
    response.writeHead(200, {
      'content-type': request.headers['content-type'] ?? 'application/json',
    });
    response.end(request.headers['content-type']?.includes('json') ? '{}' : '');
  });
  await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve));
});

afterEach(async () => {
  await new Promise((resolve) => receiver.close(resolve));
  rmSync(dir, { recursive: true, force: true });
});

const app = `
import { lookup } from 'node:dns';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { checkHealth, createLogger, logStarted, logStopping, shutdownTelemetry } from ${JSON.stringify(pathToFileURL(join(source, 'index.ts')).href)};
import { SpanKind, trace } from ${JSON.stringify(api)};
import pg from ${JSON.stringify(pg)};
const logger = createLogger({ service: 'toolkit-e2e', release: '9.9.9' });
const tracer = trace.getTracer('toolkit-e2e-manual');
tracer.startSpan('GET /health', { kind: SpanKind.SERVER, attributes: { 'http.target': '/health' } }).end();
tracer.startSpan('GET /manual', {
  kind: SpanKind.SERVER,
  attributes: { 'http.target': '/manual?email=${visitor.email}', 'http.client_ip': '${visitor.address}' },
}).end();
const pool = new pg.Pool({ host: '127.0.0.1', port: 1, connectionTimeoutMillis: 500 });
pool.on('error', () => {});
const query = () => pool.query('select 1').catch(() => {});
const resolveName = () => new Promise((resolve) => lookup('localhost', resolve));
const dial = () => new Promise((resolve) => {
  const socket = connect(1, '127.0.0.1');
  socket.on('error', resolve);
  socket.on('close', resolve);
});
const call = async (path) => (await fetch('http://127.0.0.1:' + server.address().port + path)).text();
const server = createServer(async (request, response) => {
  if (request.url === '/health') {
    const report = await checkHealth({ service: 'toolkit-e2e', components: [] });
    response.writeHead(report.statusCode, { 'content-type': 'application/json' });
    response.end(JSON.stringify(report.body));
    return;
  }
  if (request.url.startsWith('/work')) {
    await query();
    await resolveName();
    await call('/inner?email=${visitor.email}');
    logger.info({ event: 'work.done', password: '${hidden}' });
  }
  response.writeHead(201);
  response.end('ok');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
await query();
await dial();
await resolveName();
await call('/background');
logStarted(logger, { port: server.address().port });
process.on('SIGTERM', async () => {
  logStopping(logger, 'SIGTERM');
  server.close();
  await shutdownTelemetry();
  process.exit(0);
});
`;

async function runApp(env: Record<string, string>): Promise<Run> {
  const script = join(dir, 'app.mjs');
  writeFileSync(script, app);
  const endpoint = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}`;
  const child = spawn(process.execPath, ['--import', join(source, 'register.ts'), script], {
    env: {
      OTEL_SERVICE_NAME: 'toolkit-e2e',
      OTEL_SERVICE_VERSION: '9.9.9',
      OTEL_EXPORTER_OTLP_ENDPOINT: endpoint,
      OTEL_METRIC_EXPORT_INTERVAL: '600000',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const port = await new Promise<number>((resolve, reject) => {
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      const match = /"event":"service\.started".*"port":(\d+)/.exec(stdout);
      if (match?.[1]) {
        resolve(Number(match[1]));
      }
    });
    child.on('exit', (code) => reject(new Error(`app exited with ${code}: ${stderr}`)));
  });
  const work = `http://127.0.0.1:${port}/work?email=${visitor.email}&code=${visitor.code}`;
  await (
    await fetch(work, {
      headers: { 'x-forwarded-for': visitor.address, 'user-agent': visitor.agent },
    })
  ).text();
  const probe = await fetch(`http://127.0.0.1:${port}/health`);
  const health = { status: probe.status, body: (await probe.json()) as unknown };
  const code = await new Promise<number | null>((resolve) => {
    child.on('exit', resolve);
    child.kill('SIGTERM');
  });
  expect(code, stderr).toBe(0);
  const lines = stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  return { stderr, stdout, lines, health };
}

function json(path: string): Record<string, unknown>[] {
  return exports
    .filter((entry) => entry.path === path)
    .map((entry) => JSON.parse(entry.body.toString()) as Record<string, unknown>);
}

function resourceSpans(): ResourceSpans[] {
  return json('/v1/traces').flatMap((body) => body.resourceSpans as ResourceSpans[]);
}

function spans(): ExportedSpan[] {
  return resourceSpans().flatMap((entry) => entry.scopeSpans.flatMap((scope) => scope.spans));
}

function attribute(attributes: readonly Attribute[], key: string): string | undefined {
  const value = attributes.find((candidate) => candidate.key === key)?.value;
  return value?.stringValue ?? (value?.intValue === undefined ? undefined : String(value.intValue));
}

function pathOf(span: ExportedSpan): string | undefined {
  return attribute(span.attributes, 'url.path') ?? attribute(span.attributes, 'http.target');
}

function serverSpan(path: string): ExportedSpan | undefined {
  return spans().find((span) => span.kind === serverKind && pathOf(span) === path);
}

describe('telemetry in a real process', () => {
  it('exports the service, one span per real request and the HTTP metrics over OTLP', async () => {
    const { stderr } = await runApp({ OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json' });
    expect(stderr).not.toMatch(/DEP0205|module\.register\(\)|Warning/);

    const resource = resourceSpans()[0]?.resource.attributes ?? [];
    expect(attribute(resource, 'service.name')).toBe('toolkit-e2e');
    expect(attribute(resource, 'service.version')).toBe('9.9.9');
    const paths = spans()
      .filter((span) => span.kind === serverKind)
      .map(pathOf);
    expect(paths.sort()).toEqual(['/background', '/inner', '/manual', '/work']);

    const metricNames = json('/v1/metrics').flatMap((body) =>
      (body.resourceMetrics as { scopeMetrics: { metrics: { name: string }[] }[] }[]).flatMap(
        (entry) => entry.scopeMetrics.flatMap((scope) => scope.metrics.map((metric) => metric.name))
      )
    );
    expect(metricNames).toContain('http.server.request.duration');
  }, 30_000);

  it('starts no trace for background calls, queries, sockets and lookups', async () => {
    await runApp({ OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json' });

    const roots = spans().filter((span) => !span.parentSpanId);
    const work = serverSpan('/work');
    const calls = spans().filter((span) => span.kind === clientKind && span.name === 'GET');
    const poolConnects = spans().filter((span) => span.name === 'pg-pool.connect');

    expect(roots.map((span) => [span.name, span.kind])).toEqual(
      expect.arrayContaining([['GET /manual', serverKind]])
    );
    expect(roots.every((span) => span.kind === serverKind)).toBe(true);
    expect(spans().filter((span) => /^(tcp|dns)\./.test(span.name))).toEqual([]);
    expect(calls.map((span) => span.parentSpanId)).toEqual([work?.spanId]);
    expect(poolConnects.map((span) => span.parentSpanId)).toEqual([work?.spanId]);
  }, 30_000);

  it('exports nothing that identifies a visitor, and no query string', async () => {
    await runApp({ OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json' });

    const call = spans().find((span) => span.kind === clientKind && span.name === 'GET');
    expect(attribute(call?.attributes ?? [], 'url.full')).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+\/inner$/
    );
    const keys = new Set(spans().flatMap((span) => span.attributes.map((entry) => entry.key)));
    for (const key of [
      'client.address',
      'network.peer.address',
      'url.query',
      'user_agent.original',
    ]) {
      expect(keys).not.toContain(key);
    }
    expect(keys).toContain('url.path');
    const sent = exports.map((entry) => entry.body.toString()).join('\n');
    expect(sent).toContain('/work');
    for (const value of personal) {
      expect(sent).not.toContain(value);
    }
  }, 30_000);

  it('writes JSON lines to standard output, with the trace of the request in them', async () => {
    const { lines, stdout } = await runApp({ OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json' });

    expect(lines.map((line) => line.event)).toEqual([
      'service.started',
      'work.done',
      'service.stopping',
    ]);
    for (const line of lines) {
      expect(line).toMatchObject({ service: 'toolkit-e2e', release: '9.9.9', level: 'info' });
    }
    const work = serverSpan('/work');
    expect(work?.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(lines[1]).toMatchObject({
      traceId: work?.traceId,
      spanId: work?.spanId,
      password: '[redacted]',
    });
    expect(lines[0]).not.toHaveProperty('traceId');
    expect(lines[2]).toMatchObject({ signal: 'SIGTERM' });
    expect(stdout).not.toContain(hidden);
  }, 30_000);

  it('answers the health route, and leaves no trace of the question', async () => {
    const { health } = await runApp({ OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json' });

    expect(health).toEqual({
      status: 200,
      body: { status: 'ok', service: 'toolkit-e2e', components: {} },
    });
    expect(spans().map(pathOf)).not.toContain('/health');
    expect(exports.map((entry) => entry.body.toString()).join('\n')).not.toContain('/health');
  }, 30_000);

  it('exports protobuf by default, with the same care', async () => {
    await runApp({});

    const traces = exports.filter((entry) => entry.path === '/v1/traces');
    expect(traces.length).toBeGreaterThan(0);
    expect(traces.every((entry) => entry.contentType === 'application/x-protobuf')).toBe(true);
    expect(exports.some((entry) => entry.path === '/v1/metrics')).toBe(true);
    const sent = Buffer.concat(exports.map((entry) => entry.body));
    expect(sent.includes('/work')).toBe(true);
    for (const value of personal) {
      expect(sent.includes(value)).toBe(false);
    }
  }, 30_000);
});
