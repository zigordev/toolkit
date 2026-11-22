import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

const otel = vi.hoisted(() => ({ nameRoute: vi.fn() }));

vi.mock('@zigordev/otel', () => ({ nameRoute: otel.nameRoute }));

const { nameRoutes } = await import('./routes.ts');

afterEach(() => {
  vi.clearAllMocks();
});

async function app() {
  const instance = Fastify();
  nameRoutes(instance);
  instance.get('/api/v1/pools/:poolId', async () => ({}));
  await instance.ready();
  return instance;
}

describe('nameRoutes', () => {
  it('names the route of a request by its pattern, never by its path', async () => {
    const instance = await app();

    await instance.inject({ method: 'GET', url: '/api/v1/pools/42?page=2' });

    expect(otel.nameRoute.mock.calls).toEqual([['/api/v1/pools/:poolId']]);
    await instance.close();
  });

  it('gives no name to a request that matches no route', async () => {
    const instance = await app();

    const response = await instance.inject({ method: 'GET', url: '/api/v1/nothing/42' });

    expect(response.statusCode).toBe(404);
    expect(otel.nameRoute).not.toHaveBeenCalled();
    await instance.close();
  });
});
