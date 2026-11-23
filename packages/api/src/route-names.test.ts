import { afterEach, describe, expect, it, vi } from 'vitest';

const otel = vi.hoisted(() => ({ nameRoute: vi.fn() }));

vi.mock('@zigordev/otel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@zigordev/otel')>()),
  nameRoute: otel.nameRoute,
}));

const { createLogger } = await import('@zigordev/otel');
const { createApi } = await import('./api.ts');

afterEach(() => {
  vi.clearAllMocks();
});

async function app() {
  const instance = await createApi({
    service: 'pools-api',
    logger: createLogger({ service: 'pools-api', destination: { write: () => true } }),
    docs: { title: 'Pools', description: 'Pools', version: '1.0.0' },
    authenticate: () => ({ id: 'tester', scopes: [] }),
  });
  instance.get('/api/v1/pools/:poolId', { schema: { hide: true } }, async () => ({}));
  await instance.ready();
  return instance;
}

describe('route names for telemetry', () => {
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
