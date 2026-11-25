import type { Verdict } from './judge.ts';
import { jobLabel, ownImages } from './product.ts';

type Pairs = Readonly<Record<string, string | null>> | readonly string[];

interface RawService {
  readonly image?: string;
  readonly restart?: string;
  readonly container_name?: string;
  readonly ports?: readonly unknown[];
  readonly tmpfs?: readonly string[] | string;
  readonly environment?: Pairs;
  readonly labels?: Pairs;
  readonly healthcheck?: {
    readonly test?: readonly string[] | string;
    readonly interval?: string;
    readonly retries?: number | string;
    readonly disable?: boolean;
  };
}

export interface RawModel {
  readonly services?: Readonly<Record<string, RawService>>;
}

export interface DeployFiles {
  readonly compose: string | undefined;
  readonly production: string | undefined;
  readonly example: string | undefined;
  readonly model: RawModel | undefined;
  readonly problem?: string;
}

export const drainLabel = 'docker-rollout.pre-stop-hook';
export const version = `\${VERSION:-local}`;
const given = new Set(['VERSION', 'DOCKER_SOCKET_GROUP']);
const pinned = /^[^@\s]+:[^@\s]+@sha256:[0-9a-f]{64}$/;
const backupLabel = 'com.zigordev.backup';
const backupKinds = new Set(['postgres']);
const postgresImages = new Set(['postgres', 'library/postgres', 'docker.io/library/postgres']);

function kept(detail: string): Verdict {
  return { promise: 7, kept: true, detail };
}

function broken(detail: string): Verdict {
  return { promise: 7, kept: false, detail };
}

function list(names: readonly string[]): string {
  if (names.length <= 1) {
    return names.join('');
  }
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

export function seconds(duration: string | undefined, otherwise: number): number {
  if (duration === undefined || duration === '') {
    return otherwise;
  }
  const units: Readonly<Record<string, number>> = { ms: 0.001, s: 1, m: 60, h: 3600 };
  const parts = [...duration.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h)/g)];
  if (parts.map((part) => part[0]).join('') !== duration) {
    return Number.NaN;
  }
  return parts.reduce((sum, part) => sum + Number(part[1]) * (units[part[2] ?? ''] ?? 0), 0);
}

export function drainHook(service: RawService): string {
  const interval = seconds(service.healthcheck?.interval, 30);
  const retries = Number(service.healthcheck?.retries ?? 3);
  return `touch /tmp/drain && sleep ${Math.ceil(interval * retries + 5)}`;
}

export function variablesOf(model: RawModel): string[] {
  const text = JSON.stringify(model).replaceAll('$$', '');
  const names = [...text.matchAll(/\$\{?([A-Za-z_][A-Za-z0-9_]*)/g)].map((match) => match[1] ?? '');
  return [...new Set(names)].filter((name) => !given.has(name)).sort();
}

function isList(pairs: Pairs): pairs is readonly string[] {
  return Array.isArray(pairs);
}

export function pairsOf(pairs: Pairs | undefined): Readonly<Record<string, string>> {
  if (pairs === undefined) {
    return {};
  }
  if (isList(pairs)) {
    return Object.fromEntries(
      pairs.map((entry) => {
        const at = entry.indexOf('=');
        return at === -1 ? [entry, ''] : [entry.slice(0, at), entry.slice(at + 1)];
      })
    );
  }
  return Object.fromEntries(Object.entries(pairs).map(([key, value]) => [key, value ?? '']));
}

function labelsOf(service: RawService): Readonly<Record<string, string>> {
  return pairsOf(service.labels);
}

function isJob(service: RawService): boolean {
  return labelsOf(service)[jobLabel] !== undefined;
}

function isRouted(service: RawService): boolean {
  return labelsOf(service)['traefik.enable'] === 'true';
}

function named(compose: string): string | undefined {
  return /^name:\s*["']?([a-z0-9][a-z0-9_-]*)["']?\s*$/m.exec(compose)?.[1];
}

function nameRule(product: string | undefined): Verdict {
  return product === undefined
    ? broken('compose.yaml names no product on a line "name: <product>" at its top')
    : kept(`compose.yaml names the product ${product}, which is its project's name on the host`);
}

function imageRule(services: [string, RawService][], product: string): Verdict {
  const own = services.filter(([, service]) => service.image?.startsWith(ownImages));
  const wrong = own.find(([, service]) => {
    const part = service.image?.slice(ownImages.length, -(version.length + 1)) ?? '';
    return (
      service.image !== `${ownImages}${part}:${version}` ||
      !part.startsWith(`${product}-`) ||
      pairsOf(service.environment).OTEL_SERVICE_VERSION !== version
    );
  });
  if (own.length === 0) {
    return broken(`the compose files run no image of ${ownImages}`);
  }
  if (wrong !== undefined) {
    return broken(
      `${wrong[0]} runs ${wrong[1].image} with OTEL_SERVICE_VERSION ${pairsOf(wrong[1].environment).OTEL_SERVICE_VERSION || 'unset'}, where both follow VERSION: ${ownImages}${product}-<part>:${version}`
    );
  }
  const images = [...new Set(own.map(([, service]) => service.image?.split(':')[0] ?? ''))];
  return kept(`our images and their OTEL_SERVICE_VERSION follow VERSION: ${list(images)}`);
}

function pinRule(services: [string, RawService][]): Verdict {
  const other = services.filter(([, service]) => !service.image?.startsWith(ownImages));
  const loose = other.find(([, service]) => !pinned.test(service.image ?? ''));
  if (loose !== undefined) {
    return broken(
      `${loose[0]} runs ${loose[1].image ?? 'no image'}, which is not pinned as name:tag@sha256:<digest>`
    );
  }
  if (other.length === 0) {
    return kept('every image is one of ours');
  }
  const images = [...new Set(other.map(([, service]) => service.image?.split(':')[0] ?? ''))];
  return kept(`every other image is pinned by its digest: ${list(images)}`);
}

function restartRule(services: [string, RawService][]): Verdict {
  const wrong = services.find(([, service]) =>
    isJob(service) ? service.restart !== 'no' : service.restart !== 'unless-stopped'
  );
  if (wrong !== undefined) {
    const wanted = isJob(wrong[1]) ? '"no", because it is a job' : 'unless-stopped';
    return broken(
      `${wrong[0]} restarts ${wrong[1].restart ?? 'never'}, where it must be ${wanted}`
    );
  }
  return kept('every long-running service restarts unless stopped, and a job never does');
}

function tmpfsOf(service: RawService): string[] {
  const mounts = service.tmpfs ?? [];
  return typeof mounts === 'string' ? [mounts] : [...mounts];
}

function testOf(service: RawService): string {
  const test = service.healthcheck?.test ?? [];
  return typeof test === 'string' ? test : test.join(' ');
}

function drainProblem(name: string, service: RawService): string | undefined {
  if (service.container_name !== undefined) {
    return `${name} has the fixed name ${service.container_name}, so two versions cannot run side by side`;
  }
  if ((service.ports ?? []).length > 0) {
    return `${name} publishes a port, so two versions cannot run side by side`;
  }
  if (service.healthcheck?.disable === true || !testOf(service).includes('/tmp/drain')) {
    return `the health check of ${name} does not fail while /tmp/drain exists`;
  }
  if (!tmpfsOf(service).some((mount) => mount === '/tmp' || mount.startsWith('/tmp:'))) {
    return `${name} has no /tmp in memory, where the pre-stop hook writes /tmp/drain`;
  }
  const hook = drainHook(service);
  if (labelsOf(service)[drainLabel] !== hook) {
    return `${name} has no label ${drainLabel}: "${hook}", the interval times the retries of its health check plus 5 seconds`;
  }
  return undefined;
}

function drainRule(services: [string, RawService][]): Verdict {
  const routed = services.filter(([, service]) => isRouted(service));
  const problem = routed
    .map(([name, service]) => drainProblem(name, service))
    .find((found) => found !== undefined);
  if (problem !== undefined) {
    return broken(problem);
  }
  if (routed.length === 0) {
    return kept('no service is routed by the ingress, so none has to drain');
  }
  const one = routed.length === 1;
  return kept(
    `${list(routed.map(([name]) => name))} ${one ? 'drains before it stops' : 'drain before they stop'}: no fixed name or port, /tmp in memory, and the pre-stop hook of docker-rollout`
  );
}

function secretsRule(example: string | undefined, model: RawModel): Verdict {
  if (example === undefined) {
    return broken('there is no .env.production.example beside compose.yaml');
  }
  const lines = example.split('\n').filter((line) => line.trim() !== '');
  const valued = lines.find((line) => !/^[A-Z_][A-Z0-9_]*=$/.test(line));
  if (valued !== undefined) {
    return broken(
      `.env.production.example holds "${valued.split('=')[0]}" with a value or in another form, where each line is NAME= alone`
    );
  }
  const listed = new Set(lines.map((line) => line.slice(0, -1)));
  const missing = variablesOf(model).filter((name) => !listed.has(name));
  if (missing.length > 0) {
    return broken(
      `the compose files use ${list(missing)}, which .env.production.example does not name, so the host would give them no value`
    );
  }
  return kept(
    `.env.production.example names ${lines.length === 1 ? '1 secret' : `${lines.length} secrets`}, with no value, and the compose files use no other`
  );
}

function addressRule(services: [string, RawService][], product: string): Verdict {
  const host = `Host(\`${product}.zigordev.com\`)`;
  const routed = services.filter(([, service]) => isRouted(service));
  const wrong = routed.find(([, service]) => {
    const rules = Object.entries(labelsOf(service))
      .filter(([key]) => /^traefik\.http\.routers\.[^.]+\.rule$/.test(key))
      .map(([, rule]) => rule);
    return rules.length === 0 || rules.some((rule) => !rule.includes(host));
  });
  if (routed.length === 0) {
    return broken(`compose.production.yaml routes nothing to ${product}.zigordev.com`);
  }
  if (wrong !== undefined) {
    return broken(`compose.production.yaml does not route ${wrong[0]} to ${host}`);
  }
  return kept(
    `compose.production.yaml routes ${list(routed.map(([name]) => name))} to ${product}.zigordev.com`
  );
}

function repositoryOf(image: string | undefined): string {
  const reference = image?.split('@')[0] ?? '';
  const tag = reference.lastIndexOf(':');
  return tag > reference.lastIndexOf('/') ? reference.slice(0, tag) : reference;
}

function backupRule(services: [string, RawService][]): Verdict {
  const unknown = services.find(([, service]) => {
    const kind = labelsOf(service)[backupLabel];
    return kind !== undefined && !backupKinds.has(kind);
  });
  if (unknown !== undefined) {
    return broken(
      `${unknown[0]} has the label ${backupLabel}: "${labelsOf(unknown[1])[backupLabel]}", but the backup knows only the kind postgres`
    );
  }
  const missing = services.find(
    ([, service]) =>
      postgresImages.has(repositoryOf(service.image)) &&
      labelsOf(service)[backupLabel] === undefined
  );
  if (missing !== undefined) {
    return broken(
      `${missing[0]} runs PostgreSQL without the label ${backupLabel}: postgres, so the backup on the host would never find it`
    );
  }
  const stores = services
    .filter(([, service]) => labelsOf(service)[backupLabel] !== undefined)
    .map(([name]) => name);
  if (stores.length === 0) {
    return kept(
      `no service runs postgres or carries the label ${backupLabel}, so the backup has nothing to dump`
    );
  }
  const one = stores.length === 1;
  return kept(
    `${list(stores)} ${one ? 'carries' : 'carry'} the label ${backupLabel}: postgres, so the backup on the host finds ${one ? 'it' : 'them'}`
  );
}

export function judgeCompose(files: DeployFiles): Verdict[] {
  const product = named(files.compose ?? '');
  const verdicts = [nameRule(product)];
  if (files.production === undefined) {
    return [...verdicts, broken('there is no compose.production.yaml beside compose.yaml')];
  }
  if (files.model === undefined) {
    return [
      ...verdicts,
      broken(
        `compose.yaml and compose.production.yaml cannot be read together: ${files.problem ?? 'no answer'}`
      ),
    ];
  }
  const services = Object.entries(files.model.services ?? {});
  const images = product === undefined ? [] : [imageRule(services, product)];
  const address = product === undefined ? [] : [addressRule(services, product)];
  return [
    ...verdicts,
    ...images,
    pinRule(services),
    restartRule(services),
    drainRule(services),
    secretsRule(files.example, files.model),
    ...address,
    backupRule(services),
  ];
}
