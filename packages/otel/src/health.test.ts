import { describe, expect, it } from 'vitest';
import { checkHealth, type HealthComponent } from './index.ts';

const up = (name: string, required: boolean): HealthComponent => ({
  name,
  required,
  check: () => 'up',
});
const down = (name: string, required: boolean): HealthComponent => ({
  name,
  required,
  check: () => 'down',
});

describe('checkHealth', () => {
  it('answers 200 ok when every component is up', async () => {
    const report = await checkHealth({
      service: 'gpool-api',
      components: [up('db', true), up('mail', false)],
    });

    expect(report).toEqual({
      statusCode: 200,
      body: {
        status: 'ok',
        service: 'gpool-api',
        components: { db: { status: 'up' }, mail: { status: 'up' } },
      },
    });
  });

  it('answers 200 degraded when only an optional component is down', async () => {
    const report = await checkHealth({
      service: 'gpool-api',
      components: [up('db', true), down('mail', false)],
    });

    expect(report.statusCode).toBe(200);
    expect(report.body.status).toBe('degraded');
  });

  it('answers 503 error when a required component is down', async () => {
    const report = await checkHealth({
      service: 'gpool-api',
      components: [down('db', true), down('mail', false)],
    });

    expect(report.statusCode).toBe(503);
    expect(report.body.status).toBe('error');
  });

  it('treats unknown as not failing', async () => {
    const report = await checkHealth({
      service: 'gpool-api',
      components: [{ name: 'db', required: true, check: () => 'unknown' }],
    });

    expect(report.statusCode).toBe(200);
    expect(report.body).toMatchObject({ status: 'ok', components: { db: { status: 'unknown' } } });
  });

  it('reports a check that throws or rejects as down', async () => {
    const report = await checkHealth({
      service: 'gpool-api',
      components: [
        {
          name: 'sync',
          required: true,
          check: () => {
            throw new Error('boom');
          },
        },
        { name: 'async', required: false, check: () => Promise.reject(new Error('boom')) },
      ],
    });

    expect(report.body.components).toEqual({ sync: { status: 'down' }, async: { status: 'down' } });
  });

  it('reports a check that outlasts the timeout as down', async () => {
    const report = await checkHealth({
      service: 'gpool-api',
      timeoutMs: 20,
      components: [{ name: 'db', required: true, check: () => new Promise(() => undefined) }],
    });

    expect(report).toMatchObject({
      statusCode: 503,
      body: { components: { db: { status: 'down' } } },
    });
  });

  it('awaits an async check that answers in time', async () => {
    const report = await checkHealth({
      service: 'gpool-api',
      components: [{ name: 'db', required: true, check: async () => 'up' as const }],
    });

    expect(report.body.components).toEqual({ db: { status: 'up' } });
  });

  it('answers ok for a service with no components', async () => {
    const report = await checkHealth({ service: 'cv-web', components: [] });

    expect(report).toEqual({
      statusCode: 200,
      body: { status: 'ok', service: 'cv-web', components: {} },
    });
  });
});
