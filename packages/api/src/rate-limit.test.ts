import { randomUUID } from 'node:crypto';
import { createLogger } from '@zigordev/otel';
import { afterEach, describe, expect, it } from 'vitest';
import { type Api, type ApiOptions, createApi } from './api.ts';
import { bearerToken } from './auth.ts';
import { clientAddress, isPrivateAddress, trustOneProxy } from './rate-limit.ts';

const token = randomUUID();
let open: Api | undefined;

async function build(overrides: Partial<ApiOptions> = {}): Promise<Api> {
  const app = await createApi({
    service: 'limits-api',
    logger: createLogger({ service: 'limits-api', destination: { write: () => true } }),
    docs: { title: 'Limits', description: 'Limits', version: '1.0.0' },
    authenticate: (request) =>
      bearerToken(request) === token ? { id: 'caller', scopes: [] } : undefined,
    rateLimit: { max: 3, windowMs: 60_000 },
    ...overrides,
  });
  app.get(
    '/api/v1/where',
    { config: { public: true }, schema: { hide: true } },
    async (request) => ({
      ip: request.ip,
      key: clientAddress(request),
    })
  );
  app.get('/api/v1/private', { schema: { hide: true } }, async () => ({ ok: true }));
  await app.ready();
  open = app;
  return app;
}

afterEach(async () => {
  await open?.close();
  open = undefined;
});

describe('the rate limit', () => {
  it('answers 429 in the error format once a client has used up its calls', async () => {
    const app = await build();
    const codes: number[] = [];
    for (let call = 0; call < 3; call += 1) {
      codes.push((await app.inject({ method: 'GET', url: '/api/v1/where' })).statusCode);
    }

    const response = await app.inject({ method: 'GET', url: '/api/v1/where' });

    expect(codes).toEqual([200, 200, 200]);
    expect(response.statusCode).toBe(429);
    expect(response.headers['content-type']).toBe('application/problem+json; charset=utf-8');
    expect(response.headers['retry-after']).toBe('60');
    expect(response.headers['x-ratelimit-limit']).toBe('3');
    expect(response.json()).toMatchObject({
      status: 429,
      title: 'Too many requests',
      code: 'request.rate_limited',
      params: { limit: 3, retryAfter: '1 minute' },
    });
  });

  it('counts each client on its own', async () => {
    const app = await build();
    for (let call = 0; call < 3; call += 1) {
      await app.inject({
        method: 'GET',
        url: '/api/v1/where',
        headers: { 'cf-connecting-ip': '198.51.100.1' },
      });
    }

    const first = await app.inject({
      method: 'GET',
      url: '/api/v1/where',
      headers: { 'cf-connecting-ip': '198.51.100.1' },
    });
    const second = await app.inject({
      method: 'GET',
      url: '/api/v1/where',
      headers: { 'cf-connecting-ip': '198.51.100.2' },
    });

    expect(first.statusCode).toBe(429);
    expect(second.statusCode).toBe(200);
  });

  it('never limits the health route', async () => {
    const app = await build();
    const codes = new Set<number>();
    for (let call = 0; call < 10; call += 1) {
      codes.add((await app.inject({ method: 'GET', url: '/health' })).statusCode);
    }

    expect([...codes]).toEqual([200]);
  });

  it('counts the calls that fail to sign in, before it checks them', async () => {
    const app = await build();
    const codes: number[] = [];
    for (let call = 0; call < 4; call += 1) {
      codes.push(
        (
          await app.inject({
            method: 'GET',
            url: '/api/v1/private',
            headers: { authorization: `Bearer ${randomUUID()}` },
          })
        ).statusCode
      );
    }

    expect(codes).toEqual([401, 401, 401, 429]);
  });

  it('allows 300 calls a minute when the API sets no limit of its own', async () => {
    const app = await build({ rateLimit: undefined });

    const response = await app.inject({ method: 'GET', url: '/api/v1/where' });

    expect(response.headers['x-ratelimit-limit']).toBe('300');
  });
});

describe('the address it counts', () => {
  async function where(remoteAddress: string, headers: Record<string, string> = {}) {
    const app = await build();
    return (
      await app.inject({ method: 'GET', url: '/api/v1/where', remoteAddress, headers })
    ).json();
  }

  it('takes the address that Cloudflare sends, first', async () => {
    expect(
      await where('172.18.0.3', {
        'cf-connecting-ip': '203.0.113.9',
        'x-forwarded-for': '198.51.100.7',
      })
    ).toMatchObject({ key: '203.0.113.9' });
  });

  it('takes the address that the proxy forwards, when the proxy is a container', async () => {
    expect(await where('172.18.0.3', { 'x-forwarded-for': '198.51.100.7' })).toEqual({
      ip: '198.51.100.7',
      key: '198.51.100.7',
    });
  });

  it('trusts one hop only, so an address a client put in front is ignored', async () => {
    expect(
      await where('172.18.0.3', { 'x-forwarded-for': '10.9.9.9, 198.51.100.7' })
    ).toMatchObject({ ip: '198.51.100.7' });
  });

  it('ignores a forwarded address that does not come from a container', async () => {
    expect(await where('203.0.113.50', { 'x-forwarded-for': '10.0.0.1' })).toEqual({
      ip: '203.0.113.50',
      key: '203.0.113.50',
    });
  });

  it('counts the IPv6 addresses of one network of 64 as one client', async () => {
    const first = await where('172.18.0.3', { 'cf-connecting-ip': '2001:db8:1:2::10' });
    const second = await where('172.18.0.3', { 'cf-connecting-ip': '2001:db8:1:2::99' });

    expect(first.key).toBe(second.key);
  });

  it('keeps a value it cannot read as an address as it is', async () => {
    expect(await where('172.18.0.3', { 'cf-connecting-ip': 'not an address' })).toMatchObject({
      key: 'not an address',
    });
  });
});

describe('isPrivateAddress and trustOneProxy', () => {
  it.each([
    ['10.1.2.3', true],
    ['172.16.0.1', true],
    ['172.31.255.255', true],
    ['172.32.0.1', false],
    ['192.168.65.1', true],
    ['127.0.0.1', true],
    ['::1', true],
    ['fd00::1', true],
    ['::ffff:172.18.0.3', true],
    ['::FFFF:8.8.8.8', false],
    ['8.8.8.8', false],
    ['2001:db8::1', false],
    ['localhost', false],
  ])('finds %s private: %s', (address, expected) => {
    expect(isPrivateAddress(address)).toBe(expected);
  });

  it('trusts a private peer at the first hop, and nothing beyond it', () => {
    expect(trustOneProxy('172.18.0.3', 0)).toBe(true);
    expect(trustOneProxy('172.18.0.3', 1)).toBe(false);
    expect(trustOneProxy('203.0.113.50', 0)).toBe(false);
  });
});
