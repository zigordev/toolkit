import { EventEmitter } from 'node:events';
import { createLogger } from '@zigordev/otel';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Server, type Signal, serve, stopOnSignals } from './server.ts';

let lines: string[];
let app: FastifyInstance | undefined;

function logger() {
  lines = [];
  return createLogger({
    service: 'things-api',
    destination: { write: (line: string) => lines.push(line) },
  });
}

function records(): Record<string, unknown>[] {
  return lines.map((line) => JSON.parse(line) as Record<string, unknown>);
}

function portOf(instance: FastifyInstance): number {
  const address = instance.server.address();
  return typeof address === 'object' && address !== null ? address.port : 0;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('serve', () => {
  it('listens, writes service.started with its port, and answers', async () => {
    app = Fastify();
    app.get('/ping', async () => ({ pong: true }));

    await serve(app, { port: 0, host: '127.0.0.1', logger: logger() });
    const response = await fetch(`http://127.0.0.1:${portOf(app)}/ping`);

    expect(await response.json()).toEqual({ pong: true });
    expect(records()).toContainEqual(
      expect.objectContaining({ event: 'service.started', port: 0 })
    );
  });
});

describe('stop', () => {
  it('finishes the request in flight, closes the port, and ends with code 0', async () => {
    app = Fastify();
    app.get('/slow', async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return { done: true };
    });
    const server = await serve(app, { port: 0, host: '127.0.0.1', logger: logger() });
    const base = `http://127.0.0.1:${portOf(app)}`;

    const inFlight = fetch(`${base}/slow`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const code = await server.stop('SIGTERM');

    expect(code).toBe(0);
    expect(await (await inFlight).json()).toEqual({ done: true });
    await expect(fetch(`${base}/slow`)).rejects.toThrow();
    expect(records()).toContainEqual(
      expect.objectContaining({ event: 'service.stopping', signal: 'SIGTERM' })
    );
  });

  it('stops once, however often it is asked', async () => {
    app = Fastify();
    const close = vi.spyOn(app, 'close');
    const server = await serve(app, { port: 0, host: '127.0.0.1', logger: logger() });

    const [first, second] = await Promise.all([server.stop('SIGTERM'), server.stop('SIGINT')]);

    expect([first, second]).toEqual([0, 0]);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('gives up at its deadline, says so, and ends with code 1', async () => {
    app = Fastify();
    app.addHook('onClose', () => new Promise<void>(() => undefined));
    const server = await serve(app, {
      port: 0,
      host: '127.0.0.1',
      logger: logger(),
      stopTimeoutMs: 100,
    });

    const code = await server.stop('SIGTERM');

    expect(code).toBe(1);
    expect(records()).toContainEqual(
      expect.objectContaining({ level: 'error', event: 'service.stop_timed_out', timeoutMs: 100 })
    );
    app = undefined;
  });

  it('ends with code 1, and says why, when the server cannot close', async () => {
    app = Fastify();
    const server = await serve(app, { port: 0, host: '127.0.0.1', logger: logger() });
    vi.spyOn(app, 'close').mockRejectedValueOnce(new Error('still busy'));

    const code = await server.stop('SIGINT');

    expect(code).toBe(1);
    expect(records()).toContainEqual(
      expect.objectContaining({
        level: 'error',
        event: 'service.stop_failed',
        error: expect.objectContaining({ message: 'still busy' }),
      })
    );
  });
});

describe('stopOnSignals', () => {
  function fakeServer(code: number): Server & { readonly stopped: Signal[] } {
    const stopped: Signal[] = [];
    return {
      stopped,
      stop: async (signal) => {
        stopped.push(signal);
        return code;
      },
    };
  }

  it.each(['SIGTERM', 'SIGINT'] as const)(
    'stops the server on %s, and exits with its code',
    async (signal) => {
      const signals = new EventEmitter();
      const server = fakeServer(0);
      const exit = vi.fn();

      stopOnSignals(server, signals, exit);
      signals.emit(signal);
      await vi.waitFor(() => expect(exit).toHaveBeenCalled());

      expect(server.stopped).toEqual([signal]);
      expect(exit).toHaveBeenCalledWith(0);
    }
  );

  it('passes on the code of a stop that failed', async () => {
    const signals = new EventEmitter();
    const exit = vi.fn();

    stopOnSignals(fakeServer(1), signals, exit);
    signals.emit('SIGTERM');
    await vi.waitFor(() => expect(exit).toHaveBeenCalled());

    expect(exit).toHaveBeenCalledWith(1);
  });

  it('listens for each signal once', () => {
    const signals = new EventEmitter();

    stopOnSignals(fakeServer(0), signals, vi.fn());

    expect(signals.listenerCount('SIGTERM')).toBe(1);
    expect(signals.listenerCount('SIGINT')).toBe(1);
  });
});
