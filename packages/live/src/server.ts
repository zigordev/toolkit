import type { ServerResponse } from 'node:http';
import { metrics } from '@opentelemetry/api';
import { addHealthComponent, type Principal, ProblemError, principalOf } from '@zigordev/api';
import { createCounterAtZero } from '@zigordev/otel';
import { type SQL, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  changeEvent,
  type LiveChange,
  type LiveNotice,
  liveChannel,
  liveNotice,
  livePath,
  maxChangesPerMessage,
  resyncEvent,
} from './index.ts';
import type { LiveListener } from './listener.ts';

export type { Backoff, LiveHandlers, LiveListener, PgListenerOptions } from './listener.ts';
export { defaultBackoff, pgListener, retryDelay } from './listener.ts';

export const instrumentationName = '@zigordev/live';
export const defaultHeartbeatMs = 30_000;
export const defaultWindowMs = 1_000;
export const defaultMaxStreamsPerUser = 10;
export const maxBufferedBytes = 64 * 1024;

export type ChannelsOf = (
  principal: Principal,
  request: FastifyRequest
) => readonly string[] | Promise<readonly string[]>;

export interface LiveUpdatesOptions {
  readonly listener: LiveListener;
  readonly channelsOf: ChannelsOf;
  readonly heartbeatMs?: number;
  readonly windowMs?: number;
  readonly maxStreamsPerUser?: number;
}

export interface LiveUpdates {
  readonly openStreams: () => number;
}

export interface SqlExecutor {
  execute(query: SQL): PromiseLike<unknown>;
}

interface Stream {
  readonly user: string;
  readonly channels: readonly string[];
  readonly response: ServerResponse;
}

interface Window {
  readonly pending: Map<string, LiveChange>;
  overflowed: boolean;
  readonly timer: NodeJS.Timeout;
}

const streamHeaders = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  'x-accel-buffering': 'no',
};

function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function writable(response: ServerResponse): boolean {
  return !response.writableEnded && !response.destroyed;
}

function changeOf(notice: LiveNotice): LiveChange {
  return notice.id === undefined ? { type: notice.type } : { type: notice.type, id: notice.id };
}

function keyOf(change: LiveChange): string {
  return JSON.stringify([change.type, change.id ?? null]);
}

export async function notifyChange(db: SqlExecutor, notice: LiveNotice): Promise<void> {
  const payload = JSON.stringify(liveNotice.parse(notice));
  await db.execute(sql`select pg_notify(${liveChannel}, ${payload})`);
}

export function addLiveUpdates(app: FastifyInstance, options: LiveUpdatesOptions): LiveUpdates {
  const heartbeatMs = options.heartbeatMs ?? defaultHeartbeatMs;
  const windowMs = options.windowMs ?? defaultWindowMs;
  const maxStreams = options.maxStreamsPerUser ?? defaultMaxStreamsPerUser;
  const meter = metrics.getMeter(instrumentationName);
  const openStreams = meter.createUpDownCounter('zigordev.live.streams', {
    description: 'Live-update streams open now',
    unit: '{stream}',
  });
  openStreams.add(0);
  const messages = createCounterAtZero(
    meter,
    'zigordev.live.messages',
    { description: 'Messages written to live-update streams, by event', unit: '{message}' },
    [{ 'zigordev.live.event': changeEvent }, { 'zigordev.live.event': resyncEvent }]
  );

  const streams = new Set<Stream>();
  const byChannel = new Map<string, Set<Stream>>();
  const perUser = new Map<string, number>();
  const windows = new Map<string, Window>();
  let heartbeat: NodeJS.Timeout | undefined;
  let closing = false;

  function close(stream: Stream): void {
    if (!streams.delete(stream)) {
      return;
    }
    for (const channel of stream.channels) {
      const listeners = byChannel.get(channel);
      listeners?.delete(stream);
      if (listeners?.size === 0) {
        byChannel.delete(channel);
        clearTimeout(windows.get(channel)?.timer);
        windows.delete(channel);
      }
    }
    const left = (perUser.get(stream.user) ?? 1) - 1;
    if (left === 0) {
      perUser.delete(stream.user);
    } else {
      perUser.set(stream.user, left);
    }
    openStreams.add(-1);
    if (streams.size === 0) {
      clearInterval(heartbeat);
      heartbeat = undefined;
    }
    if (writable(stream.response)) {
      stream.response.end();
    }
  }

  function write(stream: Stream, text: string): boolean {
    if (!writable(stream.response) || stream.response.writableLength > maxBufferedBytes) {
      close(stream);
      return false;
    }
    stream.response.write(text);
    return true;
  }

  function send(targets: Iterable<Stream>, event: string, data: unknown): void {
    const text = frame(event, data);
    for (const stream of [...targets]) {
      if (write(stream, text)) {
        messages.add(1, { 'zigordev.live.event': event });
      }
    }
  }

  function flush(channel: string, changes: readonly LiveChange[], overflowed: boolean): void {
    const targets = byChannel.get(channel);
    if (targets === undefined) {
      return;
    }
    if (overflowed) {
      send(targets, resyncEvent, {});
    } else {
      send(targets, changeEvent, { channel, changes });
    }
  }

  function openWindow(channel: string): void {
    const timer = setTimeout(() => endWindow(channel), windowMs);
    timer.unref();
    windows.set(channel, { pending: new Map(), overflowed: false, timer });
  }

  function endWindow(channel: string): void {
    const window = windows.get(channel);
    windows.delete(channel);
    if (window === undefined || (window.pending.size === 0 && !window.overflowed)) {
      return;
    }
    flush(channel, [...window.pending.values()], window.overflowed);
    openWindow(channel);
  }

  function hear(notice: LiveNotice): void {
    if (!byChannel.has(notice.channel)) {
      return;
    }
    const change = changeOf(notice);
    const window = windows.get(notice.channel);
    if (window === undefined) {
      flush(notice.channel, [change], false);
      openWindow(notice.channel);
      return;
    }
    if (window.overflowed) {
      return;
    }
    window.pending.set(keyOf(change), change);
    if (window.pending.size > maxChangesPerMessage) {
      window.overflowed = true;
      window.pending.clear();
    }
  }

  function resyncAll(): void {
    for (const window of windows.values()) {
      clearTimeout(window.timer);
    }
    windows.clear();
    send(streams, resyncEvent, {});
  }

  function beat(): void {
    for (const stream of [...streams]) {
      write(stream, ': heartbeat\n\n');
    }
  }

  function open(user: string, channels: readonly string[], response: ServerResponse): void {
    const stream: Stream = { user, channels, response };
    streams.add(stream);
    perUser.set(user, (perUser.get(user) ?? 0) + 1);
    for (const channel of channels) {
      const listeners = byChannel.get(channel) ?? new Set<Stream>();
      listeners.add(stream);
      byChannel.set(channel, listeners);
    }
    openStreams.add(1);
    if (heartbeat === undefined) {
      heartbeat = setInterval(beat, heartbeatMs);
      heartbeat.unref();
    }
    response.on('close', () => close(stream));
    response.on('error', () => close(stream));
  }

  addHealthComponent(app, {
    name: 'live',
    required: false,
    check: () => (options.listener.listening() ? 'up' : 'down'),
  });

  app.addHook('onReady', async () => {
    await options.listener.start({ notice: hear, reconnected: resyncAll });
  });

  app.addHook('preClose', async () => {
    closing = true;
    for (const stream of [...streams]) {
      close(stream);
    }
  });

  app.addHook('onClose', async () => {
    await options.listener.stop();
  });

  app.get(livePath, { schema: { hide: true } }, async (request, reply) => {
    const principal = principalOf(request);
    const channels = [...new Set(await options.channelsOf(principal, request))];
    if (closing) {
      throw new ProblemError({
        status: 503,
        code: 'live.stopping',
        detail: 'This copy of the service is stopping. Connect again.',
      });
    }
    if ((perUser.get(principal.id) ?? 0) >= maxStreams) {
      throw new ProblemError({
        status: 429,
        code: 'live.too_many_streams',
        detail: `One user may keep ${maxStreams} live-update streams open at once.`,
        params: { limit: maxStreams },
      });
    }
    reply.hijack();
    reply.raw.writeHead(200, streamHeaders);
    reply.raw.write(': ready\n\n');
    open(principal.id, channels, reply.raw);
  });

  return { openStreams: () => streams.size };
}
