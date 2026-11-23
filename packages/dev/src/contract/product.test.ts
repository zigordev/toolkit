import { describe, expect, it } from 'vitest';
import { agentAddress, overrideFor, type Product, readProduct } from './product.ts';

const model = {
  name: 'gpool',
  networks: { zigordev: { name: 'zigordev', external: true } },
  services: {
    'gpool-api': {
      image: 'ghcr.io/zigordev/gpool-api:local',
      environment: { PORT: '3000', OTEL_EXPORTER_OTLP_ENDPOINT: 'http://alloy:4318' },
    },
    'gpool-web': {
      image: 'ghcr.io/zigordev/gpool-web:local',
      environment: { PORT: '3000', OTEL_EXPORTER_OTLP_ENDPOINT: 'http://alloy:4318' },
    },
    db: { image: 'postgres:18.1', environment: { POSTGRES_DB: 'gpool' } },
  },
};

const agent = {
  image: 'node:26.13.1-alpine',
  script: '/repo/node_modules/@zigordev/dev/dist/contract/agent.js',
  target: '/contract/agent.mjs',
  host: 'alloy',
  port: '4318',
};

function product(change: (services: typeof model.services) => unknown = (services) => services) {
  return readProduct(
    JSON.stringify({ ...model, services: change(structuredClone(model.services)) })
  );
}

describe('readProduct', () => {
  it('takes the services that run our own images as the apps, and leaves the data stores', () => {
    expect(product()).toEqual({
      name: 'gpool',
      networks: ['zigordev'],
      jobs: [],
      apps: [
        {
          service: 'gpool-api',
          image: 'ghcr.io/zigordev/gpool-api:local',
          port: '3000',
          agent: 'http://alloy:4318',
        },
        {
          service: 'gpool-web',
          image: 'ghcr.io/zigordev/gpool-web:local',
          port: '3000',
          agent: 'http://alloy:4318',
        },
      ],
    });
  });

  it('leaves out what compose.yaml does not give an app', () => {
    const read = readProduct(
      JSON.stringify({ services: { 'gpool-api': { image: 'ghcr.io/zigordev/gpool-api:local' } } })
    );

    expect(read).toEqual({
      name: '',
      networks: [],
      jobs: [],
      apps: [
        {
          service: 'gpool-api',
          image: 'ghcr.io/zigordev/gpool-api:local',
          port: undefined,
          agent: undefined,
        },
      ],
    });
  });

  it('takes a service with the job label for a job, not an app, and names who waits for it', () => {
    const read = product((services) => ({
      ...services,
      'gpool-api': {
        ...services['gpool-api'],
        depends_on: {
          'gpool-api-migrate': { condition: 'service_completed_successfully', required: true },
          db: { condition: 'service_healthy' },
        },
      },
      'gpool-web': {
        ...services['gpool-web'],
        depends_on: { 'gpool-api-migrate': { condition: 'service_started' } },
      },
      'gpool-api-migrate': {
        image: 'ghcr.io/zigordev/gpool-api:local',
        labels: { 'com.zigordev.job': 'migrate' },
      },
    }));

    expect(read.apps.map((app) => app.service)).toEqual(['gpool-api', 'gpool-web']);
    expect(read.jobs).toEqual([
      { service: 'gpool-api-migrate', kind: 'migrate', waitedForBy: ['gpool-api'] },
    ]);
  });

  it('finds no app in a model without services', () => {
    expect(readProduct('{}').apps).toEqual([]);
  });
});

describe('agentAddress', () => {
  it('is the one address every app sends its telemetry to', () => {
    expect(agentAddress(product())?.href).toBe('http://alloy:4318/');
  });

  it.each([
    ['one app names another address', 'http://collector:4318'],
    ['one app names none', undefined],
  ])('is unknown when %s', (_case, address) => {
    const mixed: Product = {
      ...product(),
      apps: product().apps.map((app, index) => (index === 0 ? { ...app, agent: address } : app)),
    };

    expect(agentAddress(mixed)).toBeUndefined();
  });

  it('is unknown when the address is no address', () => {
    const wrong: Product = {
      ...product(),
      apps: product().apps.map((app) => ({ ...app, agent: 'alloy on 4318' })),
    };

    expect(agentAddress(wrong)).toBeUndefined();
  });
});

describe('overrideFor', () => {
  const override = overrideFor(product(), 'gpool-contract', agent) as {
    networks: Record<string, unknown>;
    services: Record<string, Record<string, unknown>>;
  };

  it('gives the run a network of its own in place of the shared one', () => {
    expect(override.networks).toEqual({
      zigordev: { external: false, name: 'gpool-contract-zigordev' },
    });
  });

  it('makes each app send soon, start after the stand-in, and stay away from the ingress', () => {
    for (const app of ['gpool-api', 'gpool-web']) {
      expect(override.services[app]).toEqual({
        environment: { OTEL_METRIC_EXPORT_INTERVAL: '1000', OTEL_BSP_SCHEDULE_DELAY: '500' },
        labels: { 'traefik.enable': 'false' },
        depends_on: { 'contract-agent': { condition: 'service_started' } },
      });
    }
    expect(override.services).not.toHaveProperty('db');
  });

  it('adds the stand-in for the agent under the name and the port the apps send to', () => {
    expect(override.services['contract-agent']).toEqual({
      image: 'node:26.13.1-alpine',
      command: ['node', '/contract/agent.mjs', 'serve', '4318'],
      user: '1000:1000',
      init: true,
      stop_grace_period: '1s',
      volumes: [
        {
          type: 'bind',
          source: '/repo/node_modules/@zigordev/dev/dist/contract/agent.js',
          target: '/contract/agent.mjs',
          read_only: true,
        },
      ],
      networks: { zigordev: { aliases: ['alloy'] } },
    });
  });

  it('puts the stand-in on the default network of a product that names none', () => {
    const plain = overrideFor({ ...product(), networks: [] }, 'gpool-contract', agent) as {
      networks: Record<string, unknown>;
      services: Record<string, { networks?: unknown }>;
    };

    expect(plain.networks).toEqual({});
    expect(plain.services['contract-agent']?.networks).toEqual({ default: { aliases: ['alloy'] } });
  });
});
