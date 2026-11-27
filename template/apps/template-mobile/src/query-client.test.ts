import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApi } from './api';
import { createQueryClient } from './query-client';
import { RequestTimeoutError, withTimeout } from './timeout';

describe('the app’s queries', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fail after one timeout, without asking the API again', async () => {
    const fetcher = vi.fn(() => new Promise<Response>(() => undefined));
    const hello = createApi(withTimeout(fetcher, 50)).queryOptions('get', '/api/v1/hello');
    const outcome = expect(createQueryClient().fetchQuery(hello)).rejects.toBeInstanceOf(
      RequestTimeoutError
    );

    await vi.advanceTimersByTimeAsync(50);

    await outcome;
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('ask the API three more times after an ordinary failure', async () => {
    const fetcher = vi.fn(() => Promise.reject(new TypeError('Network request failed')));
    const hello = createApi(withTimeout(fetcher)).queryOptions('get', '/api/v1/hello');
    const outcome = expect(createQueryClient().fetchQuery(hello)).rejects.toThrow(
      'Network request failed'
    );

    await vi.advanceTimersByTimeAsync(7_000);

    await outcome;
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
