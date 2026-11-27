import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RequestTimeoutError,
  requestTimeoutMs,
  retries,
  shouldRetry,
  withTimeout,
} from './timeout';

const url = 'https://api.test/api/v1/hello';

function hanging() {
  const seen: { signal?: AbortSignal | null | undefined } = {};
  const fetcher = (_input: RequestInfo | URL, init?: RequestInit) => {
    seen.signal = init?.signal;
    return new Promise<Response>(() => undefined);
  };
  return { fetcher, seen };
}

function stoppable(_input: RequestInfo | URL, init?: RequestInit) {
  return new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('stopped by the caller')));
  });
}

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes on an answer that comes in time, and stops its timer', async () => {
    const answer = new Response('hello');
    const fetcher = vi.fn(async () => answer);

    await expect(withTimeout(fetcher)(url)).resolves.toBe(answer);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('calls the global fetch of the moment the request is made', async () => {
    const timed = withTimeout();
    const answer = new Response('hello');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answer)
    );
    try {
      await expect(timed(url)).resolves.toBe(answer);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('passes on a failure as it is, and stops its timer', async () => {
    const failure = new TypeError('Network request failed');

    await expect(withTimeout(() => Promise.reject(failure))(url)).rejects.toBe(failure);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('gives up after ten seconds even when the request never ends, and tells it to stop', async () => {
    const { fetcher, seen } = hanging();
    const outcome = expect(withTimeout(fetcher)(url)).rejects.toBeInstanceOf(RequestTimeoutError);

    await vi.advanceTimersByTimeAsync(requestTimeoutMs - 1);
    expect(seen.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await outcome;
    expect(seen.signal?.aborted).toBe(true);
    expect(requestTimeoutMs).toBe(10_000);
  });

  it('waits for the time it is given', async () => {
    const { fetcher } = hanging();
    const outcome = expect(withTimeout(fetcher, 50)(url)).rejects.toMatchObject({ afterMs: 50 });

    await vi.advanceTimersByTimeAsync(50);
    await outcome;
  });

  it('passes on a stop from the caller, without waiting for the timer', async () => {
    const caller = new AbortController();
    const asked = withTimeout(stoppable)(url, { signal: caller.signal });

    caller.abort();

    await expect(asked).rejects.toThrow('stopped by the caller');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops at once when the caller had stopped already', () => {
    const { fetcher, seen } = hanging();
    const caller = new AbortController();
    caller.abort();

    void withTimeout(fetcher)(url, { signal: caller.signal });

    expect(seen.signal?.aborted).toBe(true);
  });

  it('hears the caller through the signal of a Request', () => {
    const { fetcher, seen } = hanging();
    const caller = new AbortController();

    void withTimeout(fetcher)(new Request(url, { signal: caller.signal }));
    caller.abort();

    expect(seen.signal?.aborted).toBe(true);
  });

  it('leaves the rest of the request as it was', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    const request = new Request('https://api.test/api/v1/notes', { method: 'POST' });

    await withTimeout(fetcher)(request, { headers: { 'x-test': '1' } });

    expect(fetcher).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ headers: { 'x-test': '1' } })
    );
  });
});

describe('shouldRetry', () => {
  it('asks again up to three times after an ordinary failure', () => {
    const failure = new TypeError('Network request failed');

    expect([0, 1, 2, 3].map((count) => shouldRetry(count, failure))).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(retries).toBe(3);
  });

  it('never asks again after a timeout, because the person has waited already', () => {
    expect(shouldRetry(0, new RequestTimeoutError(requestTimeoutMs))).toBe(false);
  });

  it('never asks again after the API refused the request, as the answer would not change', () => {
    expect(shouldRetry(0, { status: 401, title: 'Unauthorized' })).toBe(false);
    expect(shouldRetry(0, { status: 404, title: 'Not Found' })).toBe(false);
  });

  it('asks again after a failure on the server’s side', () => {
    expect(shouldRetry(0, { status: 503, title: 'Service Unavailable' })).toBe(true);
  });
});
