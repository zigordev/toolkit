import { metrics } from '@opentelemetry/api';
import { MeterProvider, MetricReader } from '@opentelemetry/sdk-metrics';
import { type Api, bearerToken, createApi } from '@zigordev/api';
import { createLogger, isUntracedRequest } from '@zigordev/otel';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type LiveNotice, livePath } from './index.ts';
import type { LiveHandlers, LiveListener } from './listener.ts';
import { addLiveUpdates, type LiveUpdatesOptions, notifyChange } from './server.ts';

interface Frame {
  readonly event?: string;
  readonly data?: string;
  readonly comment?: string;
}

interface FakeListener {
  readonly listener: LiveListener;
  up: boolean;
  stopped: boolean;
  notice(notice: LiveNotice): void;
  reconnect(): void;
}

function fakeListener(): FakeListener {
  let handlers: LiveHandlers | undefined;
  const fake: FakeListener = {
    up: true,
    stopped: false,
    listener: {
      start: async (given) => {
        handlers = given;
      },
      stop: async () => {
        fake.stopped = true;
      },
      listening: () => fake.up,
    },
    notice: (notice) => handlers?.notice(notice),
    reconnect: () => handlers?.reconnected(),
  };
  return fake;
}

interface Running {
  readonly app: Api;
  readonly base: string;
  readonly fake: FakeListener;
  readonly openStreams: () => number;
}

let running: Running | undefined;

async function start(overrides: Partial<LiveUpdatesOptions> = {}): Promise<Running> {
  const app = await createApi({
    service: 'notes-api',
    logger: createLogger({ service: 'notes-api', level: 'warn', destination: { write: () => {} } }),
    docs: { title: 'Notes API', description: 'Notes to try live updates on', version: '1.0.0' },
    authenticate: (request) => {
      const user = bearerToken(request);
      return user === undefined ? undefined : { id: user, scopes: [] };
    },
  });
  const fake = fakeListener();
  const live = addLiveUpdates(app, {
    listener: fake.listener,
    channelsOf: (principal) => [`notes:${principal.id}`, 'notes:all'],
    windowMs: 100,
    ...overrides,
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  running = { app, base: `http://127.0.0.1:${port}`, fake, openStreams: live.openStreams };
  return running;
}

afterEach(async () => {
  await running?.app.close();
  running = undefined;
});

function parseBlock(block: string): Frame {
  const frame: { event?: string; data?: string; comment?: string } = {};
  for (const line of block.split('\n')) {
    if (line.startsWith(':')) {
      frame.comment = line.slice(1).trim();
    } else if (line.startsWith('event: ')) {
      frame.event = line.slice('event: '.length);
    } else if (line.startsWith('data: ')) {
      frame.data = line.slice('data: '.length);
    }
  }
  return frame;
}

interface Client {
  readonly response: Response;
  readonly frames: Frame[];
  readonly ended: () => boolean;
  readonly events: (name: string) => unknown[];
  readonly leave: () => void;
}

async function connect(base: string, user: string): Promise<Client> {
  const controller = new AbortController();
  const response = await fetch(`${base}/api/v1/live`, {
    headers: { authorization: `Bearer ${user}` },
    signal: controller.signal,
  });
  const frames: Frame[] = [];
  let ended = false;
  const body = response.body;
  if (body !== null && response.ok) {
    const reader = body.pipeThrough(new TextDecoderStream()).getReader();
    void (async () => {
      let buffer = '';
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }
          buffer += value;
          let end = buffer.indexOf('\n\n');
          while (end !== -1) {
            frames.push(parseBlock(buffer.slice(0, end)));
            buffer = buffer.slice(end + 2);
            end = buffer.indexOf('\n\n');
          }
        }
      } catch {
        return;
      } finally {
        ended = true;
      }
    })();
  }
  return {
    response,
    frames,
    ended: () => ended,
    events: (name) =>
      frames
        .filter((frame) => frame.event === name)
        .map((frame) => JSON.parse(frame.data ?? 'null') as unknown),
    leave: () => controller.abort(),
  };
}

const updated = (id: string, channel = 'notes:u1'): LiveNotice => ({
  channel,
  type: 'note.updated',
  id,
});

describe('the live route', () => {
  it('refuses a stream without sign-in', async () => {
    const { base } = await start();

    const response = await fetch(`${base}/api/v1/live`);

    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).toMatch(/^application\/problem\+json/);
  });

  it('opens a stream of server-sent events that nothing between may buffer', async () => {
    const { base, openStreams } = await start();

    const client = await connect(base, 'u1');

    expect(client.response.status).toBe(200);
    expect(client.response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    expect(client.response.headers.get('cache-control')).toBe('no-cache, no-transform');
    expect(client.response.headers.get('x-accel-buffering')).toBe('no');
    await vi.waitFor(() => expect(client.frames).toContainEqual({ comment: 'ready' }));
    expect(openStreams()).toBe(1);
  });

  it('sends a change only to the streams that may hear its channel', async () => {
    const { base, fake } = await start();
    const first = await connect(base, 'u1');
    const second = await connect(base, 'u2');

    fake.notice(updated('n1'));
    fake.notice({ channel: 'notes:u2', type: 'note.created', id: 'n2' });
    fake.notice({ channel: 'notes:u3', type: 'note.created', id: 'n3' });

    await vi.waitFor(() => {
      expect(first.events('change')).toEqual([
        { channel: 'notes:u1', changes: [{ type: 'note.updated', id: 'n1' }] },
      ]);
      expect(second.events('change')).toEqual([
        { channel: 'notes:u2', changes: [{ type: 'note.created', id: 'n2' }] },
      ]);
    });
  });

  it('sends a change on a shared channel to every stream that hears it', async () => {
    const { base, fake } = await start();
    const first = await connect(base, 'u1');
    const second = await connect(base, 'u2');

    fake.notice({ channel: 'notes:all', type: 'notes.archived' });

    await vi.waitFor(() => {
      for (const client of [first, second]) {
        expect(client.events('change')).toEqual([
          { channel: 'notes:all', changes: [{ type: 'notes.archived' }] },
        ]);
      }
    });
  });

  it('groups the changes of one channel into at most one message per window', async () => {
    const { base, fake } = await start({ windowMs: 150 });
    const client = await connect(base, 'u1');
    await vi.waitFor(() => expect(client.frames).toContainEqual({ comment: 'ready' }));

    fake.notice(updated('n1'));
    fake.notice(updated('n2'));
    fake.notice(updated('n3'));
    fake.notice(updated('n2'));

    await vi.waitFor(() => expect(client.events('change')).toHaveLength(2));
    expect(client.events('change')).toEqual([
      { channel: 'notes:u1', changes: [{ type: 'note.updated', id: 'n1' }] },
      {
        channel: 'notes:u1',
        changes: [
          { type: 'note.updated', id: 'n2' },
          { type: 'note.updated', id: 'n3' },
        ],
      },
    ]);

    await new Promise((resolve) => setTimeout(resolve, 400));
    fake.notice(updated('n4'));

    await vi.waitFor(() => expect(client.events('change')).toHaveLength(3));
    expect(client.events('change')[2]).toEqual({
      channel: 'notes:u1',
      changes: [{ type: 'note.updated', id: 'n4' }],
    });
  });

  it('asks for a resync when one window holds more changes than a message may list', async () => {
    const { base, fake } = await start();
    const client = await connect(base, 'u1');
    await vi.waitFor(() => expect(client.frames).toContainEqual({ comment: 'ready' }));

    fake.notice(updated('first'));
    for (let index = 0; index < 60; index += 1) {
      fake.notice(updated(`n${index}`));
    }

    await vi.waitFor(() => expect(client.events('resync')).toEqual([{}]));
    expect(client.events('change')).toHaveLength(1);
  });

  it('asks every stream for a resync when the listener connects again', async () => {
    const { base, fake } = await start();
    const first = await connect(base, 'u1');
    const second = await connect(base, 'u2');
    await vi.waitFor(() => expect(second.frames).toContainEqual({ comment: 'ready' }));

    fake.notice(updated('n1'));
    fake.reconnect();

    await vi.waitFor(() => {
      expect(first.events('resync')).toEqual([{}]);
      expect(second.events('resync')).toEqual([{}]);
    });
  });

  it('keeps every stream alive with a heartbeat', async () => {
    const { base } = await start({ heartbeatMs: 50 });

    const client = await connect(base, 'u1');

    await vi.waitFor(() => expect(client.frames).toContainEqual({ comment: 'heartbeat' }));
  });

  it('refuses a stream above the limit for one user, and counts each user apart', async () => {
    const { base } = await start({ maxStreamsPerUser: 1 });
    await connect(base, 'u1');

    const refused = await fetch(`${base}/api/v1/live`, { headers: { authorization: 'Bearer u1' } });
    const other = await connect(base, 'u2');

    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({
      code: 'live.too_many_streams',
      params: { limit: 1 },
    });
    expect(other.response.status).toBe(200);
  });

  it('forgets a stream when its page goes away', async () => {
    const { base, fake, openStreams } = await start();
    const client = await connect(base, 'u1');
    await vi.waitFor(() => expect(openStreams()).toBe(1));

    client.leave();

    await vi.waitFor(() => expect(openStreams()).toBe(0));
    fake.notice(updated('n1'));
    const again = await connect(base, 'u1');
    await vi.waitFor(() => expect(again.frames).toContainEqual({ comment: 'ready' }));
    expect(openStreams()).toBe(1);
  });

  it('ends every stream and stops the listener when the service stops', async () => {
    const current = await start();
    const client = await connect(current.base, 'u1');
    await vi.waitFor(() => expect(client.frames).toContainEqual({ comment: 'ready' }));

    await current.app.close();
    running = undefined;

    await vi.waitFor(() => expect(client.ended()).toBe(true));
    expect(current.fake.stopped).toBe(true);
    expect(current.openStreams()).toBe(0);
  });

  it('refuses a stream that the stop overtook while its channels were read', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const current = await start({
      channelsOf: async (principal) => {
        await gate;
        return [`notes:${principal.id}`];
      },
    });

    const pending = fetch(`${current.base}/api/v1/live`, {
      headers: { authorization: 'Bearer u1' },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const closing = current.app.close();
    running = undefined;
    await new Promise((resolve) => setTimeout(resolve, 50));
    release();
    const response = await pending;
    current.app.server.closeIdleConnections();
    await closing;

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'live.stopping' });
  });

  it('reports the listener in the health answer without failing the service', async () => {
    const { base, fake } = await start();

    const up = (await (await fetch(`${base}/health`)).json()) as Record<string, unknown>;
    fake.up = false;
    const downResponse = await fetch(`${base}/health`);
    const down = (await downResponse.json()) as Record<string, unknown>;

    expect(up).toMatchObject({ status: 'ok', components: { live: { status: 'up' } } });
    expect(downResponse.status).toBe(200);
    expect(down).toMatchObject({ status: 'degraded', components: { live: { status: 'down' } } });
  });

  it('is a path that leaves no trace and no request duration', () => {
    expect(isUntracedRequest(livePath)).toBe(true);
  });

  it('keeps the route out of the API pages', async () => {
    const { app } = await start();

    const document = (await app.inject({ url: '/api/v1/docs/json' })).json() as {
      paths: Record<string, unknown>;
    };

    expect(Object.keys(document.paths)).not.toContain('/api/v1/live');
  });
});

class TestReader extends MetricReader {
  protected override async onShutdown(): Promise<void> {}
  protected override async onForceFlush(): Promise<void> {}
}

describe('the live metrics', () => {
  const reader = new TestReader();
  const meterProvider = new MeterProvider({ readers: [reader] });

  beforeAll(() => {
    metrics.setGlobalMeterProvider(meterProvider);
  });

  afterAll(async () => {
    await meterProvider.shutdown();
    metrics.disable();
  });

  async function points(name: string): Promise<{ attributes: unknown; value: unknown }[]> {
    const { resourceMetrics } = await reader.collect();
    const metric = resourceMetrics.scopeMetrics
      .flatMap((scope) => scope.metrics)
      .find((candidate) => candidate.descriptor.name === name);
    return (metric?.dataPoints ?? []).map((point) => ({
      attributes: point.attributes,
      value: point.value,
    }));
  }

  it('count open streams, and messages by event, from zero', async () => {
    const { base, fake } = await start();

    expect(await points('zigordev.live.streams')).toEqual([{ attributes: {}, value: 0 }]);
    expect(await points('zigordev.live.messages')).toEqual([
      { attributes: { 'zigordev.live.event': 'change' }, value: 0 },
      { attributes: { 'zigordev.live.event': 'resync' }, value: 0 },
    ]);

    const client = await connect(base, 'u1');
    await vi.waitFor(() => expect(client.frames).toContainEqual({ comment: 'ready' }));
    fake.notice(updated('n1'));
    fake.reconnect();
    await vi.waitFor(() => expect(client.events('resync')).toHaveLength(1));

    expect(await points('zigordev.live.streams')).toEqual([{ attributes: {}, value: 1 }]);
    expect(await points('zigordev.live.messages')).toEqual([
      { attributes: { 'zigordev.live.event': 'change' }, value: 1 },
      { attributes: { 'zigordev.live.event': 'resync' }, value: 1 },
    ]);
  });
});

describe('notifyChange', () => {
  it('sends the notice through pg_notify on the connection it is given', async () => {
    const queries: SQL[] = [];

    await notifyChange(
      { execute: async (query) => queries.push(query) },
      { channel: 'notes:u1', type: 'note.updated', id: 'n1' }
    );

    expect(queries).toHaveLength(1);
    const rendered = new PgDialect().sqlToQuery(queries[0] as SQL);
    expect(rendered.sql).toBe('select pg_notify($1, $2)');
    expect(rendered.params[0]).toBe('zigordev_live');
    expect(JSON.parse(String(rendered.params[1]))).toEqual({
      channel: 'notes:u1',
      type: 'note.updated',
      id: 'n1',
    });
  });

  it('refuses a notice of the wrong shape before it reaches the database', async () => {
    const execute = vi.fn(async () => undefined);

    await expect(
      notifyChange({ execute }, { channel: 'notes:u1', type: 'Note updated' })
    ).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });
});
