import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface Service {
  readonly image: string;
  readonly user?: string;
  readonly init?: boolean;
  readonly read_only?: boolean;
  readonly cap_drop?: readonly string[];
  readonly security_opt?: readonly string[];
  readonly stop_grace_period?: string;
  readonly mem_limit?: string;
  readonly cpus?: number;
  readonly container_name?: string;
  readonly build?: { readonly context: string; readonly dockerfile: string };
  readonly environment?: Readonly<Record<string, string>>;
  readonly labels?: Readonly<Record<string, string>>;
  readonly ports?: readonly unknown[];
  readonly networks?: Readonly<Record<string, unknown>>;
  readonly healthcheck?: { readonly test?: readonly string[] };
  readonly tmpfs?: readonly string[];
}

interface Model {
  readonly name: string;
  readonly services: Readonly<Record<string, Service>>;
  readonly networks: Readonly<
    Record<string, { readonly name: string; readonly external?: boolean }>
  >;
}

const folder = fileURLToPath(new URL('.', import.meta.url));

function model(files: readonly string[], version?: string): Model {
  const { VERSION: _inherited, ...env } = process.env;
  const output = execFileSync(
    'docker',
    ['compose', ...files.flatMap((file) => ['--file', file]), 'config', '--format', 'json'],
    {
      cwd: folder,
      encoding: 'utf8',
      env: version === undefined ? env : { ...env, VERSION: version },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  return JSON.parse(output) as Model;
}

const everywhere = model(['compose.yaml']);
const laptop = model(['compose.yaml', 'compose.local.yaml']);
const production = model(['compose.yaml', 'compose.production.yaml']);
const released = model(['compose.yaml', 'compose.production.yaml'], '1f3a9c2');
const apps = ['template-api', 'template-web'];

function rule(from: Model, app: string): string | undefined {
  return from.services[app]?.labels?.[`traefik.http.routers.${app}.rule`];
}

describe('the product', () => {
  it('is one Compose project named after the product, with one service per app', () => {
    expect(everywhere.name).toBe('template');
    expect(Object.keys(everywhere.services).sort()).toEqual(apps);
  });

  it('joins the network of the shared services, and makes none of its own', () => {
    expect(Object.keys(everywhere.networks)).toEqual(['zigordev']);
    expect(everywhere.networks.zigordev).toMatchObject({ name: 'zigordev', external: true });
  });

  it('is built from its own Dockerfiles on the laptop, and only there', () => {
    for (const app of apps) {
      expect(laptop.services[app]?.build?.dockerfile).toBe(`template/apps/${app}/Dockerfile`);
      expect(everywhere.services[app]?.build).toBeUndefined();
      expect(production.services[app]?.build).toBeUndefined();
    }
  });

  it('answers at its local address on the laptop, and at its own in production', () => {
    expect(rule(laptop, 'template-api')).toBe('Host(`template.localhost`) && PathPrefix(`/api`)');
    expect(rule(laptop, 'template-web')).toBe('Host(`template.localhost`)');
    expect(rule(production, 'template-api')).toBe(
      'Host(`template.zigordev.com`) && PathPrefix(`/api`)'
    );
    expect(rule(production, 'template-web')).toBe('Host(`template.zigordev.com`)');
  });

  it('says which environment it runs in', () => {
    for (const app of apps) {
      expect(laptop.services[app]?.environment?.OTEL_RESOURCE_ATTRIBUTES).toBe(
        'deployment.environment.name=local'
      );
      expect(production.services[app]?.environment?.OTEL_RESOURCE_ATTRIBUTES).toBe(
        'deployment.environment.name=production'
      );
    }
  });
});

describe.each(apps)('%s', (app) => {
  const service = everywhere.services[app];

  it('runs our own image, under the version local when none is given', () => {
    expect(service?.image).toBe(`ghcr.io/zigordev/${app}:local`);
    expect(service?.environment?.OTEL_SERVICE_VERSION).toBe('local');
  });

  it('takes its version from VERSION, for the image and for its telemetry alike', () => {
    expect(released.services[app]?.image).toBe(`ghcr.io/zigordev/${app}:1f3a9c2`);
    expect(released.services[app]?.environment?.OTEL_SERVICE_VERSION).toBe('1f3a9c2');
  });

  it('has one name: its service, its image and its telemetry agree', () => {
    expect(service?.environment?.OTEL_SERVICE_NAME).toBe(app);
    expect(service?.container_name).toBeUndefined();
  });

  it('sends its telemetry to the agent, and listens on the port it is given', () => {
    expect(service?.environment?.OTEL_EXPORTER_OTLP_ENDPOINT).toBe('http://alloy:4318');
    expect(service?.environment?.PORT).toBe('3000');
  });

  it('has a health check that asks its health route', () => {
    expect(service?.healthcheck?.test?.[0]).toBe('CMD');
    expect(service?.healthcheck?.test?.at(-1)).toBe('http://127.0.0.1:3000/health');
  });

  it('has a memory limit and a CPU limit', () => {
    expect(Number(service?.mem_limit)).toBeGreaterThan(0);
    expect(service?.cpus).toBeGreaterThan(0);
  });

  it('runs under an init, as a user that is not root, on a read-only file system', () => {
    expect(service?.init).toBe(true);
    expect(service?.user).toBe('1000:1000');
    expect(service?.read_only).toBe(true);
  });

  it('writes only to memory, and to no more of it than a size it names', () => {
    for (const mount of service?.tmpfs ?? []) {
      expect(mount).toMatch(/^\/app\/[\w./-]+:uid=1000,gid=1000,size=\d+m$/);
    }
    expect(service?.tmpfs?.length ?? 0).toBe(app === 'template-web' ? 1 : 0);
  });

  it('can gain no privilege, holds no capability, and gets 30 seconds to stop', () => {
    expect(service?.security_opt).toEqual(['no-new-privileges:true']);
    expect(service?.cap_drop).toEqual(['ALL']);
    expect(service?.stop_grace_period).toBe('30s');
  });

  it('is reached through the ingress only: a route, its port, and no published port', () => {
    expect(service?.labels?.['traefik.enable']).toBe('true');
    expect(service?.labels?.[`traefik.http.services.${app}.loadbalancer.server.port`]).toBe('3000');
    expect(service?.ports).toBeUndefined();
    expect(Object.keys(service?.networks ?? {})).toEqual(['zigordev']);
  });

  it('has a Dockerfile that ends as the user node, with its own ignore file', () => {
    const dockerfile = readFileSync(`${folder}apps/${app}/Dockerfile`, 'utf8');
    const ignored = readFileSync(`${folder}apps/${app}/Dockerfile.dockerignore`, 'utf8');

    expect(dockerfile).toMatch(/^USER node$/m);
    expect(dockerfile).toMatch(/^CMD \["node", "--import", "@zigordev\/otel\/register", /m);
    expect(ignored.split('\n')).toEqual(expect.arrayContaining(['.git', '**/node_modules']));
  });

  it('is built on one exact Node.js image, of the major version its package asks for', () => {
    const dockerfile = readFileSync(`${folder}apps/${app}/Dockerfile`, 'utf8');
    const manifest = JSON.parse(readFileSync(`${folder}apps/${app}/package.json`, 'utf8')) as {
      readonly engines: { readonly node: string };
    };
    const bases = dockerfile.split('\n').filter((line) => line.startsWith('FROM '));
    const images = new Set(bases.map((line) => line.split(' ')[1]));
    const [image] = images;

    expect(bases).toHaveLength(2);
    expect(images.size).toBe(1);
    expect(image).toMatch(/^node:\d+\.\d+\.\d+-alpine\d+\.\d+$/);
    expect(manifest.engines.node).toBe(`>=${image?.match(/^node:(\d+)\./)?.[1]}`);
  });
});
