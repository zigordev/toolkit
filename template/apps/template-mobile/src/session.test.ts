import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApi } from './api';
import { withSession } from './session';
import { withTimeout } from './timeout';

const session = 'template.session_token=abc.def';

function recorder() {
  const seen: Request[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push(new Request(input, init));
    return Response.json({ message: 'Hello' });
  });
  return { fetcher, seen };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('withSession', () => {
  it('sends the stored session as a cookie, beside the request’s own headers and body', async () => {
    const { fetcher, seen } = recorder();
    const send = withSession(async () => session, fetcher);

    await send(
      new Request('http://api.test/api/v1/notes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"title":"Milk"}',
      })
    );

    expect(seen[0]?.headers.get('cookie')).toBe(session);
    expect(seen[0]?.headers.get('content-type')).toBe('application/json');
    expect(seen[0]?.method).toBe('POST');
    expect(await seen[0]?.text()).toBe('{"title":"Milk"}');
  });

  it('sends no cookie when the phone keeps no session', async () => {
    const { fetcher, seen } = recorder();

    await withSession(async () => '', fetcher)('http://api.test/api/v1/hello');

    expect(seen[0]?.headers.has('cookie')).toBe(false);
  });

  it('keeps the phone’s own cookie store out of every request', async () => {
    const { fetcher } = recorder();

    await withSession(async () => session, fetcher)('http://api.test/api/v1/hello');

    expect(fetcher.mock.calls[0]?.[1]?.credentials).toBe('omit');
  });

  it('keeps the headers given beside an address, and lets them win', async () => {
    const { fetcher, seen } = recorder();

    await withSession(async () => session, fetcher)(
      new Request('http://api.test/api/v1/hello', { headers: { accept: 'text/plain' } }),
      { headers: { accept: 'application/json', 'x-request': 'one' } }
    );

    expect(seen[0]?.headers.get('accept')).toBe('application/json');
    expect(seen[0]?.headers.get('x-request')).toBe('one');
    expect(seen[0]?.headers.get('cookie')).toBe(session);
  });

  it('reads the global fetch at the moment of each request', async () => {
    const { fetcher, seen } = recorder();
    vi.stubGlobal('fetch', fetcher);

    await withSession(async () => session)('http://api.test/api/v1/hello');

    expect(seen[0]?.headers.get('cookie')).toBe(session);
  });

  it('carries the session through the app’s real client and time limit', async () => {
    const { fetcher, seen } = recorder();
    const api = createApi(withTimeout(withSession(async () => session, fetcher)));

    const { data } = await api.client.GET('/api/v1/hello');

    expect(data).toEqual({ message: 'Hello' });
    expect(seen[0]?.headers.get('cookie')).toBe(session);
    expect(seen[0]?.signal.aborted).toBe(false);
  });
});
