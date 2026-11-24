import { describe, expect, it } from 'vitest';
import {
  type DeployFiles,
  drainHook,
  judgeCompose,
  pairsOf,
  type RawModel,
  seconds,
  variablesOf,
} from './compose.ts';

const version = `\${VERSION:-local}`;
const digest = `sha256:${'d'.repeat(64)}`;
const check = 'test ! -e /tmp/drain && wget -q -T 4 -O /dev/null http://127.0.0.1:3000/health';

type Service = NonNullable<RawModel['services']>[string];

function app(name: string): Service {
  return {
    image: `ghcr.io/zigordev/${name}:${version}`,
    restart: 'unless-stopped',
    tmpfs: ['/tmp:uid=1000,gid=1000,size=1m'],
    environment: { OTEL_SERVICE_VERSION: version, API_KEYS: `\${GPOOL_API_KEYS:-}` },
    healthcheck: { test: ['CMD-SHELL', check], interval: '10s', retries: 3 },
    labels: {
      'traefik.enable': 'true',
      'docker-rollout.pre-stop-hook': 'touch /tmp/drain && sleep 35',
      [`traefik.http.routers.${name}.rule`]: 'Host(`gpool.zigordev.com`)',
    },
  };
}

function services(): Record<string, Service> {
  return {
    'gpool-api': app('gpool-api'),
    'gpool-web': app('gpool-web'),
    'gpool-api-migrate': {
      image: `ghcr.io/zigordev/gpool-api:${version}`,
      restart: 'no',
      environment: {
        OTEL_SERVICE_VERSION: version,
        DATABASE_URL: `postgresql://gpool:\${POSTGRES_PASSWORD:-}@gpool-postgres:5432/gpool`,
      },
      labels: { 'com.zigordev.job': 'migrate' },
    },
    'gpool-postgres': {
      image: `postgres:18.7-alpine3.24@${digest}`,
      restart: 'unless-stopped',
      environment: { POSTGRES_PASSWORD: `\${POSTGRES_PASSWORD:-}` },
      labels: { 'com.zigordev.backup': 'postgres' },
    },
  };
}

function files(change: (all: Record<string, Service>) => void = () => undefined): DeployFiles {
  const all = services();
  change(all);
  return {
    compose: 'name: gpool\n\nservices: {}\n',
    production: 'services: {}\n',
    example: 'POSTGRES_PASSWORD=\nGPOOL_API_KEYS=\n',
    model: { services: all },
  };
}

function broken(found: DeployFiles): string[] {
  return judgeCompose(found)
    .filter((verdict) => !verdict.kept)
    .map((verdict) => verdict.detail);
}

describe('judgeCompose', () => {
  it('finds every deploy rule kept by a product that keeps them, and says what it saw', () => {
    expect(judgeCompose(files())).toEqual(
      [
        "compose.yaml names the product gpool, which is its project's name on the host",
        'our images and their OTEL_SERVICE_VERSION follow VERSION: ghcr.io/zigordev/gpool-api and ghcr.io/zigordev/gpool-web',
        'every other image is pinned by its digest: postgres',
        'every long-running service restarts unless stopped, and a job never does',
        'gpool-api and gpool-web drain before they stop: no fixed name or port, /tmp in memory, and the pre-stop hook of docker-rollout',
        '.env.production.example names 2 secrets, with no value, and the compose files use no other',
        'compose.production.yaml routes gpool-api and gpool-web to gpool.zigordev.com',
      ].map((detail) => ({ promise: 7, kept: true, detail }))
    );
  });

  it('reads the lists of KEY=value that Compose prints when it leaves the variables as written', () => {
    const asLists = files((all) => {
      for (const [name, service] of Object.entries(all)) {
        all[name] = {
          ...service,
          environment: Object.entries(pairsOf(service.environment)).map(
            ([key, value]) => `${key}=${value}`
          ),
          labels: Object.entries(pairsOf(service.labels)).map(([key, value]) => `${key}=${value}`),
        };
      }
    });

    expect(broken(asLists)).toEqual([]);
    expect(pairsOf(['A=1', 'B=x=y', 'C'])).toEqual({ A: '1', B: 'x=y', C: '' });
    expect(pairsOf({ A: '1', B: null })).toEqual({ A: '1', B: '' });
    expect(pairsOf(undefined)).toEqual({});
  });

  it('refuses a compose.yaml that does not name its product', () => {
    expect(broken({ ...files(), compose: 'services: {}\n' })).toEqual([
      'compose.yaml names no product on a line "name: <product>" at its top',
    ]);
  });

  it('refuses a product without compose.production.yaml, and stops there', () => {
    expect(judgeCompose({ ...files(), production: undefined })).toEqual([
      { promise: 7, kept: true, detail: expect.stringContaining('names the product gpool') },
      {
        promise: 7,
        kept: false,
        detail: 'there is no compose.production.yaml beside compose.yaml',
      },
    ]);
  });

  it('says why the two files cannot be read together', () => {
    expect(
      broken({ ...files(), model: undefined, problem: 'services.gpool-api additional property' })
    ).toEqual([
      'compose.yaml and compose.production.yaml cannot be read together: services.gpool-api additional property',
    ]);
    expect(broken({ ...files(), model: undefined })).toEqual([
      'compose.yaml and compose.production.yaml cannot be read together: no answer',
    ]);
  });

  it.each([
    ['an image under a fixed tag', { image: 'ghcr.io/zigordev/gpool-api:1.0.0' }],
    ['an image of another product', { image: `ghcr.io/zigordev/other-api:${version}` }],
    [
      'a version for telemetry that does not follow VERSION',
      { environment: { OTEL_SERVICE_VERSION: '1.0.0' } },
    ],
    ['no version for telemetry', { environment: {} }],
  ])('refuses %s', (_case, change) => {
    const found = files((all) => {
      all['gpool-api'] = { ...app('gpool-api'), ...change };
    });

    expect(broken(found)).toEqual([
      expect.stringMatching(
        /^gpool-api runs .* where both follow VERSION: ghcr\.io\/zigordev\/gpool-<part>:\$\{VERSION:-local\}$/
      ),
    ]);
  });

  it('refuses a product that runs none of our images', () => {
    const found = files((all) => {
      for (const name of ['gpool-api', 'gpool-web', 'gpool-api-migrate']) {
        delete all[name];
      }
    });

    expect(broken(found)).toEqual([
      'the compose files run no image of ghcr.io/zigordev/',
      'compose.production.yaml routes nothing to gpool.zigordev.com',
    ]);
  });

  it.each([
    [
      'postgres:18.7-alpine3.24',
      'gpool-postgres runs postgres:18.7-alpine3.24, which is not pinned as name:tag@sha256:<digest>',
    ],
    [
      `postgres@${digest}`,
      `gpool-postgres runs postgres@${digest}, which is not pinned as name:tag@sha256:<digest>`,
    ],
    [
      `postgres:18@sha256:${'d'.repeat(63)}`,
      `gpool-postgres runs postgres:18@sha256:${'d'.repeat(63)}, which is not pinned as name:tag@sha256:<digest>`,
    ],
  ])('refuses the outside image %s', (image, detail) => {
    const found = files((all) => {
      all['gpool-postgres'] = { ...all['gpool-postgres'], image };
    });

    expect(broken(found)).toEqual([detail]);
  });

  it('takes a product whose images are all its own', () => {
    const found = files((all) => {
      delete all['gpool-postgres'];
    });

    expect(judgeCompose({ ...found, example: 'GPOOL_API_KEYS=\nPOSTGRES_PASSWORD=\n' })[2]).toEqual(
      {
        promise: 7,
        kept: true,
        detail: 'every image is one of ours',
      }
    );
  });

  it.each([
    ['gpool-web', undefined, 'gpool-web restarts never, where it must be unless-stopped'],
    ['gpool-postgres', 'always', 'gpool-postgres restarts always, where it must be unless-stopped'],
    [
      'gpool-api-migrate',
      'unless-stopped',
      'gpool-api-migrate restarts unless-stopped, where it must be "no", because it is a job',
    ],
  ])('refuses %s restarting %s', (name, restart, detail) => {
    const found = files((all) => {
      all[name] = { ...all[name], restart };
    });

    expect(broken(found)).toEqual([detail]);
  });

  it.each([
    [
      { container_name: 'gpool-web' },
      'gpool-web has the fixed name gpool-web, so two versions cannot run side by side',
    ],
    [
      { ports: [{ target: 3000, published: '3000' }] },
      'gpool-web publishes a port, so two versions cannot run side by side',
    ],
    [
      {
        healthcheck: {
          test: ['CMD', 'wget', '-q', 'http://127.0.0.1:3000/health'],
          interval: '10s',
          retries: 3,
        },
      },
      'the health check of gpool-web does not fail while /tmp/drain exists',
    ],
    [
      { healthcheck: { test: ['CMD-SHELL', check], disable: true } },
      'the health check of gpool-web does not fail while /tmp/drain exists',
    ],
    [
      { tmpfs: ['/app/.next/cache:uid=1000,gid=1000,size=64m'] },
      'gpool-web has no /tmp in memory, where the pre-stop hook writes /tmp/drain',
    ],
  ])('refuses a routed service that cannot drain: %j', (change, detail) => {
    const found = files((all) => {
      all['gpool-web'] = { ...app('gpool-web'), ...change };
    });

    expect(broken(found)).toEqual([detail]);
  });

  it('wants the pre-stop hook to wait the interval times the retries of the health check, plus 5 seconds', () => {
    const found = files((all) => {
      all['gpool-web'] = {
        ...app('gpool-web'),
        healthcheck: { test: ['CMD-SHELL', check], interval: '5s', retries: 2 },
      };
    });

    expect(broken(found)).toEqual([
      'gpool-web has no label docker-rollout.pre-stop-hook: "touch /tmp/drain && sleep 15", the interval times the retries of its health check plus 5 seconds',
    ]);
  });

  it('takes /tmp in memory written as one string', () => {
    const found = files((all) => {
      all['gpool-web'] = { ...app('gpool-web'), tmpfs: '/tmp' };
    });

    expect(broken(found)).toEqual([]);
  });

  it('takes a product that the ingress does not route, apart from its address', () => {
    const found = files((all) => {
      for (const name of ['gpool-api', 'gpool-web']) {
        all[name] = { ...app(name), labels: {} };
      }
    });

    expect(judgeCompose(found)[4]?.detail).toBe(
      'no service is routed by the ingress, so none has to drain'
    );
  });

  it.each([
    [undefined, 'there is no .env.production.example beside compose.yaml'],
    [
      'POSTGRES_PASSWORD=hunter2\nGPOOL_API_KEYS=\n',
      '.env.production.example holds "POSTGRES_PASSWORD" with a value or in another form, where each line is NAME= alone',
    ],
    [
      'postgres_password=\nGPOOL_API_KEYS=\n',
      '.env.production.example holds "postgres_password" with a value or in another form, where each line is NAME= alone',
    ],
    [
      'GPOOL_API_KEYS=\n',
      'the compose files use POSTGRES_PASSWORD, which .env.production.example does not name, so the host would give them no value',
    ],
    [
      '',
      'the compose files use GPOOL_API_KEYS and POSTGRES_PASSWORD, which .env.production.example does not name, so the host would give them no value',
    ],
  ])('refuses the secrets %j', (example, detail) => {
    expect(broken({ ...files(), example })).toEqual([detail]);
  });

  it('counts one secret as one secret', () => {
    const found = files((all) => {
      for (const [name, service] of Object.entries(all)) {
        const { API_KEYS: _keys, ...rest } = pairsOf(service.environment);
        all[name] = { ...service, environment: rest };
      }
    });

    expect(judgeCompose({ ...found, example: 'POSTGRES_PASSWORD=\n' })[5]?.detail).toBe(
      '.env.production.example names 1 secret, with no value, and the compose files use no other'
    );
  });

  it.each([
    [
      { 'traefik.http.routers.gpool-web.rule': 'Host(`gpool.localhost`)' },
      'compose.production.yaml does not route gpool-web to Host(`gpool.zigordev.com`)',
    ],
    [{}, 'compose.production.yaml does not route gpool-web to Host(`gpool.zigordev.com`)'],
  ])('refuses a routed service with the rules %j', (rules, detail) => {
    const found = files((all) => {
      const web = app('gpool-web');
      all['gpool-web'] = {
        ...web,
        labels: {
          'traefik.enable': 'true',
          'docker-rollout.pre-stop-hook': pairsOf(web.labels)['docker-rollout.pre-stop-hook'] ?? '',
          ...rules,
        },
      };
    });

    expect(broken(found)).toEqual([detail]);
  });
});

describe('the helpers of the deploy rules', () => {
  it.each([
    ['10s', 10],
    ['1m30s', 90],
    ['500ms', 0.5],
    ['1h', 3600],
    ['2.5s', 2.5],
  ])('reads the duration %s as %d seconds', (duration, expected) => {
    expect(seconds(duration, 30)).toBe(expected);
  });

  it('takes the default for a missing duration, and refuses one it cannot read', () => {
    expect(seconds(undefined, 30)).toBe(30);
    expect(seconds('', 30)).toBe(30);
    expect(seconds('ten seconds', 30)).toBeNaN();
  });

  it("works out the pre-stop hook from the health check, with Docker's defaults when it names none", () => {
    expect(drainHook({ healthcheck: { interval: '10s', retries: 3 } })).toBe(
      'touch /tmp/drain && sleep 35'
    );
    expect(drainHook({ healthcheck: { interval: '2s', retries: '2' } })).toBe(
      'touch /tmp/drain && sleep 9'
    );
    expect(drainHook({})).toBe('touch /tmp/drain && sleep 95');
  });

  it('lists the variables the compose files use, once each and in order, but those the host gives itself', () => {
    const model: RawModel = {
      services: {
        a: {
          image: `x:\${VERSION:-local}`,
          environment: {
            B: `\${ZED:-}`,
            C: '$ALPHA',
            D: '$$ESCAPED',
            E: `\${DOCKER_SOCKET_GROUP}`,
            F: `\${ZED}`,
          },
        },
      },
    };

    expect(variablesOf(model)).toEqual(['ALPHA', 'ZED']);
  });
});
