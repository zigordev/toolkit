import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApi } from './api';
import { createQueryClient, forgetPerson, refreshNotes } from './query-client';
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

const hello = ['get', '/api/v1/hello'] as const;
const list = ['get', '/api/v1/notes', { params: { query: { status: 'open' } } }] as const;
const milk = ['get', '/api/v1/notes/{noteId}', { params: { path: { noteId: 'milk' } } }] as const;
const bread = ['get', '/api/v1/notes/{noteId}', { params: { path: { noteId: 'bread' } } }] as const;

function filled() {
  const client = createQueryClient();
  client.setQueryData(hello, { message: 'Hello' });
  client.setQueryData(list, { pages: [], pageParams: [] });
  client.setQueryData(milk, { id: 'milk' });
  client.setQueryData(bread, { id: 'bread' });
  return client;
}

describe('refreshNotes', () => {
  it('marks every list of notes as old, so a screen that shows one asks again', () => {
    const client = filled();

    refreshNotes(client);

    expect(client.getQueryState(list)?.isInvalidated).toBe(true);
    expect(client.getQueryState(milk)?.isInvalidated).toBe(false);
    expect(client.getQueryState(hello)?.isInvalidated).toBe(false);
  });

  it('marks the note that changed as old too, and no other', () => {
    const client = filled();

    refreshNotes(client, 'milk');

    expect(client.getQueryState(milk)?.isInvalidated).toBe(true);
    expect(client.getQueryState(bread)?.isInvalidated).toBe(false);
  });
});

describe('forgetPerson', () => {
  it('forgets the notes of the person who signs out, and keeps what anyone may see', () => {
    const client = filled();

    forgetPerson(client);

    expect(client.getQueryData(list)).toBeUndefined();
    expect(client.getQueryData(milk)).toBeUndefined();
    expect(client.getQueryData(bread)).toBeUndefined();
    expect(client.getQueryData(hello)).toEqual({ message: 'Hello' });
  });
});
