import { existsSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Outcome, Run } from '../release.ts';
import type { Answer, Received } from './agent.ts';
import { visitor } from './judge.ts';
import { type ContractIo, contract } from './run.ts';

interface Override {
  readonly networks: Record<string, { name: string }>;
  readonly services: Record<string, { image?: string; command?: string[] }>;
}

interface World {
  model: {
    name: string;
    networks?: Record<string, unknown>;
    services: Record<
      string,
      {
        image: string;
        environment?: Record<string, string>;
        labels?: Record<string, string>;
        depends_on?: Record<string, { condition: string }>;
      }
    >;
  };
  jobState: string;
  jobLogs: Outcome;
  configFails: boolean;
  dockerDown: boolean;
  missingImage: string | undefined;
  upFails: boolean;
  agentSilent: boolean;
  health: Answer;
  movedAnswersAfter: number;
  bareStates: string[];
  received: Received[][];
  sentAfter: number;
  stopTakes: number;
  exitCode: string;
  held: string | undefined;
  heldAfter: number;
  logs: Outcome;
  agentScript: string;
  files: Record<string, string | undefined>;
  production: object;
  productionFails: boolean;
  healthTest: string[] | null;
  drainIgnored: boolean;
  tmpReadOnly: boolean;
  drained: Set<string>;
}

const ok: Outcome = { status: 0, stdout: '', stderr: '' };
const line = JSON.stringify({ level: 'info', event: 'service.started' });
const healthy: Answer = { status: 200, body: '{"status":"ok","version":"local"}' };
const version = `\${VERSION:-local}`;
const drainCheck = 'test ! -e /tmp/drain && wget -q -T 4 -O /dev/null http://127.0.0.1:3000/health';

function app(name: string): {
  image: string;
  environment: Record<string, string>;
  labels: Record<string, string>;
} {
  return {
    image: `ghcr.io/zigordev/${name}:local`,
    environment: {
      PORT: '3000',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://alloy:4318',
      OTEL_SERVICE_VERSION: 'local',
    },
    labels: { 'traefik.enable': 'true' },
  };
}

function released(name: string): object {
  return {
    image: `ghcr.io/zigordev/${name}:${version}`,
    restart: 'unless-stopped',
    tmpfs: ['/tmp:uid=1000,gid=1000,size=1m'],
    environment: { OTEL_SERVICE_VERSION: version },
    healthcheck: { test: ['CMD-SHELL', drainCheck], interval: '10s', retries: 3 },
    labels: {
      'traefik.enable': 'true',
      'docker-rollout.pre-stop-hook': 'touch /tmp/drain && sleep 35',
      [`traefik.http.routers.${name}.rule`]: 'Host(`gpool.zigordev.com`)',
    },
  };
}

function sent(...services: string[]): Received[] {
  return services.flatMap((service) => [
    { path: '/v1/traces', type: 'application/x-protobuf', found: [service] },
    { path: '/v1/metrics', type: 'application/x-protobuf', found: [service] },
  ]);
}

let world: World;
let calls: string[];
let output: string;
let clock: number;
let sleeps: number;
let override: Override | undefined;
let overridePath: string;

beforeEach(() => {
  world = {
    model: {
      name: 'gpool',
      networks: { zigordev: { external: true } },
      services: {
        'gpool-api': app('gpool-api'),
        'gpool-web': app('gpool-web'),
        db: { image: 'postgres:18.1' },
      },
    },
    configFails: false,
    dockerDown: false,
    missingImage: undefined,
    upFails: false,
    agentSilent: false,
    health: healthy,
    movedAnswersAfter: 0,
    bareStates: ['exited 1'],
    received: [sent('gpool-api', 'gpool-web')],
    sentAfter: 0,
    stopTakes: 1200,
    exitCode: '0',
    held: '{"response":"HTTP/1.1 200 OK"}',
    heldAfter: 0,
    logs: { status: 0, stdout: `${line}\n`, stderr: '' },
    jobState: 'exited 0',
    jobLogs: {
      status: 0,
      stdout: `${JSON.stringify({ event: 'migration.finished' })}\n`,
      stderr: '',
    },
    agentScript: '/repo/packages/dev/src/contract/agent.ts',
    files: {
      'compose.yaml': 'name: gpool\n',
      'compose.production.yaml': 'services: {}\n',
      '.env.production.example': 'POSTGRES_PASSWORD=\n',
    },
    production: {
      services: {
        'gpool-api': released('gpool-api'),
        'gpool-web': released('gpool-web'),
        db: {
          image: `postgres:18.1-alpine3.24@sha256:${'e'.repeat(64)}`,
          restart: 'unless-stopped',
          environment: { POSTGRES_PASSWORD: `\${POSTGRES_PASSWORD:-}` },
        },
      },
    },
    productionFails: false,
    healthTest: ['CMD-SHELL', drainCheck],
    drainIgnored: false,
    tmpReadOnly: false,
    drained: new Set(),
  };
  calls = [];
  output = '';
  clock = 0;
  sleeps = 0;
  override = undefined;
  overridePath = '';
});

function next<T>(values: T[]): T {
  return (values.length > 1 ? values.shift() : values[0]) as T;
}

const docker: Run = (command, args) => {
  const call = args.join(' ');
  calls.push(`${command} ${call}`);
  const text = (stdout: string): Outcome => ({ status: 0, stdout, stderr: '' });
  const failed = (stderr: string): Outcome => ({ status: 1, stdout: '', stderr });
  if (call === 'compose --file compose.yaml config --format json') {
    return world.configFails
      ? failed('one\ntwo\nno configuration file provided: not found')
      : text(JSON.stringify(world.model));
  }
  if (
    call ===
    'compose --file compose.yaml --file compose.production.yaml config --format json --no-interpolate'
  ) {
    return world.productionFails
      ? failed('services.gpool-api.restrt additional property restrt is not allowed')
      : text(JSON.stringify(world.production));
  }
  if (call.startsWith('inspect --format {{json .Config.Healthcheck.Test}} ')) {
    return text(`${JSON.stringify(world.healthTest)}\n`);
  }
  const container = args[1] ?? '';
  if (call === `exec ${container} touch /tmp/drain`) {
    if (world.tmpReadOnly) {
      return failed('touch: /tmp/drain: Read-only file system');
    }
    world.drained.add(container);
    return ok;
  }
  if (call === `exec ${container} rm -f /tmp/drain`) {
    world.drained.delete(container);
    return ok;
  }
  if (call.startsWith(`exec ${container} /bin/sh -c `)) {
    const drains = call.includes('/tmp/drain') && !world.drainIgnored;
    return world.drained.has(container) && drains ? failed('') : ok;
  }
  if (call.startsWith(`exec ${container} wget `)) {
    return ok;
  }
  if (call.startsWith('version ')) {
    return world.dockerDown
      ? failed('Cannot connect to the Docker daemon at unix:///var/run/docker.sock.')
      : text('29.9.2\n');
  }
  if (call.startsWith('image inspect ')) {
    return call.endsWith(world.missingImage ?? 'no such image')
      ? failed('No such image')
      : text('arm64\n');
  }
  if (call.includes(' up ')) {
    overridePath = args.find((arg) => arg.endsWith('compose.contract.json')) ?? '';
    override = JSON.parse(readFileSync(overridePath, 'utf8')) as Override;
    return world.upFails ? failed('a\nb\ncontainer gpool-contract-gpool-api-1 is unhealthy') : ok;
  }
  if (call.includes(' ps --all --quiet ')) {
    return text(`${args.at(-1)}-id\n`);
  }
  if (/^exec contract-agent-id node \S+ ask /.test(call)) {
    if (world.agentSilent) {
      return ok;
    }
    if (call.includes('-moved:')) {
      world.movedAnswersAfter -= 1;
      return text(
        JSON.stringify(world.movedAnswersAfter < 0 ? healthy : { status: 0, body: 'fetch failed' })
      );
    }
    return text(JSON.stringify(world.health));
  }
  if (/^exec contract-agent-id node \S+ received /.test(call)) {
    return text(JSON.stringify(next(world.received)));
  }
  if (call.startsWith('inspect --format {{.State.Status}}') && call.endsWith('-migrate-id')) {
    return text(`${world.jobState}\n`);
  }
  if (call === 'logs gpool-api-migrate-id') {
    return world.jobLogs;
  }
  if (call.startsWith('inspect --format {{.State.Status}}')) {
    return text(`${next(world.bareStates)}\n`);
  }
  if (call.startsWith('inspect --format {{.Config.User}}')) {
    return text('1000:1000\n');
  }
  if (call.startsWith('inspect --format {{.State.ExitCode}}')) {
    return text(`${world.exitCode}\n`);
  }
  if (call.startsWith('exec contract-agent-id test -f ')) {
    world.sentAfter -= 1;
    return world.sentAfter < 0 ? ok : failed('');
  }
  if (call.startsWith('stop ')) {
    clock += world.stopTakes;
    return ok;
  }
  if (call.startsWith('exec contract-agent-id cat ')) {
    world.heldAfter -= 1;
    return world.held === undefined || world.heldAfter >= 0
      ? failed('No such file')
      : text(world.held);
  }
  if (call.startsWith('logs ')) {
    return world.logs;
  }
  return ok;
};

function run(): number {
  const io: ContractIo = {
    cwd: '/repo/gpool',
    run: docker,
    read: (file) => world.files[file],
    write: (text) => {
      output += text;
    },
    sleep: (milliseconds) => {
      sleeps += 1;
      clock += milliseconds;
    },
    now: () => clock,
    agentScript: world.agentScript,
    node: '26.13.1',
  };
  return contract(io);
}

function called(pattern: RegExp): string[] {
  return calls.filter((call) => pattern.test(call));
}

function withJob(): void {
  world.model.services['gpool-api-migrate'] = {
    image: 'ghcr.io/zigordev/gpool-api:local',
    labels: { 'com.zigordev.job': 'migrate' },
  };
  const api = world.model.services['gpool-api'];
  if (api !== undefined) {
    api.depends_on = { 'gpool-api-migrate': { condition: 'service_completed_successfully' } };
  }
}

describe('the contract command', () => {
  it('says for each app which promises it keeps, and passes when all are kept', () => {
    expect(run()).toBe(0);

    expect(output).toBe(
      [
        'the compose files',
        "  kept    7  compose.yaml names the product gpool, which is its project's name on the host",
        '  kept    7  our images and their OTEL_SERVICE_VERSION follow VERSION: ghcr.io/zigordev/gpool-api and ghcr.io/zigordev/gpool-web',
        '  kept    7  every other image is pinned by its digest: postgres',
        '  kept    7  every long-running service restarts unless stopped, and a job never does',
        '  kept    7  gpool-api and gpool-web drain before they stop: no fixed name or port, /tmp in memory, and the pre-stop hook of docker-rollout',
        '  kept    7  .env.production.example names 1 secret, with no value, and the compose files use no other',
        '  kept    7  compose.production.yaml routes gpool-api and gpool-web to gpool.zigordev.com',
        'gpool-api',
        '  kept    1  an arm64 image that runs as the user 1000:1000',
        '  kept    2  without its settings it stops at once, with code 1',
        '  kept    3  it listens on the port in PORT, and answers GET /health with 200 and its version local',
        '  kept    4  1 line, all JSON, with nothing a visitor sent',
        '  kept    5  traces and metrics reached the agent under the name gpool-api',
        '  kept    6  it stopped 1.2 s after a SIGTERM with code 0, and answered the request it had begun',
        '  kept    7  its health check fails while /tmp/drain exists, and passes again once it is gone',
        'gpool-web',
        '  kept    1  an arm64 image that runs as the user 1000:1000',
        '  kept    2  without its settings it stops at once, with code 1',
        '  kept    3  it listens on the port in PORT, and answers GET /health with 200 and its version local',
        '  kept    4  1 line, all JSON, with nothing a visitor sent',
        '  kept    5  traces and metrics reached the agent under the name gpool-web',
        '  kept    6  it stopped 1.2 s after a SIGTERM with code 0, and answered the request it had begun',
        '  kept    7  its health check fails while /tmp/drain exists, and passes again once it is gone',
        'zigordev contract: 2 apps keep promises 1 to 7, and the compose files keep promise 7',
        '',
      ].join('\n')
    );
  });

  it('holds a job to its own two promises, not to those of an app, and counts it', () => {
    withJob();

    expect(run()).toBe(0);

    expect(output).toContain(
      [
        'gpool-api-migrate, a job',
        '  kept    1  it ended with code 0 before gpool-api started',
        '  kept    2  1 line, all JSON',
        'zigordev contract: 2 apps keep promises 1 to 7, the compose files keep promise 7, and 1 job keeps promises 1 and 2',
        '',
      ].join('\n')
    );
    expect(output).not.toMatch(/^gpool-api-migrate$/m);
    expect(called(/ run --detach .*gpool-api-migrate$/)).toEqual([]);
  });

  it('fails when a job breaks one of its promises', () => {
    withJob();
    world.jobState = 'exited 1';

    expect(run()).toBe(1);

    expect(output).toContain('  broken  1  it ended with code 1\n');
    expect(output).toContain('zigordev contract: 1 promise is broken\n');
  });

  it('starts the product under a name of its own, from the images that are built, on a network of its own', () => {
    run();

    const [up] = called(/ up /);
    expect(up).toMatch(
      /^docker compose --project-name gpool-contract --file compose\.yaml --file \S+compose\.contract\.json up --detach --wait --wait-timeout 120 --no-build$/
    );
    expect(override?.networks).toEqual({
      zigordev: { external: false, name: 'gpool-contract-zigordev' },
    });
    expect(override?.services['contract-agent']).toMatchObject({
      image: 'node:26.13.1-alpine',
      command: ['node', '/contract/agent.mts', 'serve', '4318'],
    });
    expect(Object.keys(override?.services ?? {}).sort()).toEqual([
      'contract-agent',
      'gpool-api',
      'gpool-web',
    ]);
  });

  it('runs the compiled script of the agent as a module when that is what it has', () => {
    world.agentScript = '/repo/node_modules/@zigordev/dev/dist/contract/agent.js';

    run();

    expect(override?.services['contract-agent']?.command?.[1]).toBe('/contract/agent.mjs');
    expect(
      called(/^docker exec contract-agent-id node \/contract\/agent\.mjs ask /).length
    ).toBeGreaterThan(0);
  });

  it('visits each app as a visitor would, with an address, an agent, an email and a code', () => {
    run();

    const query = `email=${visitor.email}&code=${visitor.code}`;
    expect(called(/ ask .* visitor$/)).toEqual([
      `docker exec contract-agent-id node /contract/agent.mts ask http://gpool-api:3000/?${query} visitor`,
      `docker exec contract-agent-id node /contract/agent.mts ask http://gpool-api:3000/contract-probe?${query} visitor`,
      `docker exec contract-agent-id node /contract/agent.mts ask http://gpool-web:3000/?${query} visitor`,
      `docker exec contract-agent-id node /contract/agent.mts ask http://gpool-web:3000/contract-probe?${query} visitor`,
    ]);
  });

  it('starts a second copy of each app on another port, and one with no settings and no network', () => {
    run();

    expect(called(/ run --detach /)).toEqual([
      expect.stringMatching(
        / run --detach --no-TTY --no-deps --name gpool-contract-gpool-api-moved --env PORT=3001 gpool-api$/
      ),
      'docker run --detach --name gpool-contract-gpool-api-bare --network none ghcr.io/zigordev/gpool-api:local',
      expect.stringMatching(
        / run --detach --no-TTY --no-deps --name gpool-contract-gpool-web-moved --env PORT=3001 gpool-web$/
      ),
      'docker run --detach --name gpool-contract-gpool-web-bare --network none ghcr.io/zigordev/gpool-web:local',
    ]);
    expect(called(/ ask http:\/\/gpool-contract-gpool-api-moved:3001\/health$/)).toHaveLength(1);
  });

  it('begins a request, then asks each app to stop, and gives it 30 seconds', () => {
    run();

    const order = called(/ hold | test -f |^docker stop |^docker logs /).map((call) =>
      call.replace('docker exec contract-agent-id node /contract/agent.mts ', '')
    );
    expect(order.slice(0, 4)).toEqual([
      'docker exec --detach contract-agent-id node /contract/agent.mts hold gpool-api 3000 1500 /tmp/held-gpool-api.json',
      'docker exec contract-agent-id test -f /tmp/held-gpool-api.json.sent',
      'docker stop --timeout 30 gpool-api-id',
      'docker logs gpool-api-id',
    ]);
  });

  it('asks the agent what it received, for each app by name and for what the visitor sent', () => {
    run();

    expect(called(/ received /).at(-1)).toBe(
      `docker exec contract-agent-id node /contract/agent.mts received 4318 gpool-api gpool-web ${visitor.address} ${visitor.email} ada%40example.com ${visitor.agent} ${visitor.code}`
    );
  });

  it('listens on port 80 for an agent address that names no port', () => {
    for (const service of ['gpool-api', 'gpool-web']) {
      world.model.services[service] = {
        ...app(service),
        environment: { PORT: '3000', OTEL_EXPORTER_OTLP_ENDPOINT: 'http://alloy' },
      };
    }

    run();

    expect(override?.services['contract-agent']?.command).toEqual([
      'node',
      '/contract/agent.mts',
      'serve',
      '80',
    ]);
  });

  it('removes what is left of an earlier run first, and everything it started at the end', () => {
    run();

    const down = / down --volumes --remove-orphans --timeout 1$/;
    expect(calls.findIndex((call) => down.test(call))).toBeLessThan(
      calls.findIndex((call) => / up /.test(call))
    );
    expect(calls.at(-1)).toMatch(down);
    expect(calls.slice(-5, -1)).toEqual([
      'docker rm --force gpool-contract-gpool-api-moved',
      'docker rm --force gpool-contract-gpool-api-bare',
      'docker rm --force gpool-contract-gpool-web-moved',
      'docker rm --force gpool-contract-gpool-web-bare',
    ]);
    expect(existsSync(dirname(overridePath))).toBe(false);
  });

  it('fails, and says which promise is broken, when an app breaks one', () => {
    world.logs = { status: 0, stdout: 'Listening on 3000\n', stderr: '' };
    world.model.services = { 'gpool-api': app('gpool-api') };
    world.received = [sent('gpool-api')];

    expect(run()).toBe(1);

    expect(output).toContain(
      '  broken  4  a line on standard output is not JSON: "Listening on 3000"\n'
    );
    expect(output).toContain('  kept    5  ');
    expect(output.endsWith('zigordev contract: 1 promise is broken\n')).toBe(true);
  });

  it('counts every broken promise of every app', () => {
    world.exitCode = '137';

    expect(run()).toBe(1);

    expect(output.endsWith('zigordev contract: 2 promises are broken\n')).toBe(true);
  });

  it('says that one app keeps its promises when the product has one', () => {
    world.model.services = { 'gpool-api': app('gpool-api') };
    world.received = [sent('gpool-api')];

    expect(run()).toBe(0);

    expect(
      output.endsWith(
        'zigordev contract: 1 app keeps promises 1 to 7, and the compose files keep promise 7\n'
      )
    ).toBe(true);
  });

  it('waits for the second copy to answer', () => {
    world.movedAnswersAfter = 3;

    expect(run()).toBe(0);

    expect(sleeps).toBeGreaterThanOrEqual(3);
  });

  it('gives the second copy 30 seconds, then finds promise 3 broken', () => {
    world.movedAnswersAfter = Number.POSITIVE_INFINITY;

    expect(run()).toBe(1);

    expect(output).toContain(
      '  broken  3  started with another PORT, GET /health there gave no answer (fetch failed), so it does not listen on the port it is given\n'
    );
    expect(clock).toBeGreaterThanOrEqual(60_000);
  });

  it('gives an app without settings 15 seconds to stop, then finds promise 2 broken', () => {
    world.bareStates = ['running 0'];

    expect(run()).toBe(1);

    expect(output).toContain(
      '  broken  2  it keeps running without its settings, when it should stop at once\n'
    );
  });

  it('waits for an app without settings that takes a moment to stop', () => {
    world.bareStates = ['running 0', 'running 0', 'exited 1'];

    expect(run()).toBe(0);
  });

  it('waits for the telemetry to arrive', () => {
    world.received = [[], sent('gpool-api'), sent('gpool-api', 'gpool-web')];

    expect(run()).toBe(0);

    expect(called(/ received /).length).toBe(4);
  });

  it('gives the telemetry 20 seconds, then finds promise 5 broken', () => {
    world.received = [sent('gpool-api')];

    expect(run()).toBe(1);

    expect(output).toContain('  broken  5  no trace reached the agent under the name gpool-web\n');
    expect(output).toContain(
      '  kept    5  traces and metrics reached the agent under the name gpool-api\n'
    );
  });

  it('waits until the request it holds is sent before it asks the app to stop', () => {
    world.sentAfter = 2;

    expect(run()).toBe(0);

    const first = calls.findIndex((call) => call.startsWith('docker stop '));
    expect(calls.slice(0, first).filter((call) => / test -f /.test(call))).toHaveLength(3);
  });

  it('finds promise 6 broken when the request it held never got an answer', () => {
    world.held = undefined;

    expect(run()).toBe(1);

    expect(output).toContain(
      '  broken  6  it cut off a request that had begun before the SIGTERM: the request never got an answer\n'
    );
  });

  it('finds promise 6 broken when the outcome of the held request cannot be read', () => {
    world.held = 'not json';

    expect(run()).toBe(1);

    expect(output).toContain('the request never got an answer');
  });

  it('waits a moment for the outcome of the held request', () => {
    world.heldAfter = 2;

    expect(run()).toBe(0);
  });

  it('finds promise 3 broken when the agent gives no answer at all', () => {
    world.agentSilent = true;

    expect(run()).toBe(1);

    expect(output).toContain(
      '  broken  3  GET /health on port 3000 gave no answer (the agent gave no answer)\n'
    );
  });

  it('drains each routed app the way docker-rollout does, and puts it back', () => {
    run();

    expect(
      called(/^docker (inspect --format \{\{json \S+ gpool-api-id|exec gpool-api-id )/)
    ).toEqual([
      'docker inspect --format {{json .Config.Healthcheck.Test}} gpool-api-id',
      `docker exec gpool-api-id /bin/sh -c ${drainCheck}`,
      'docker exec gpool-api-id touch /tmp/drain',
      `docker exec gpool-api-id /bin/sh -c ${drainCheck}`,
      'docker exec gpool-api-id rm -f /tmp/drain',
      `docker exec gpool-api-id /bin/sh -c ${drainCheck}`,
    ]);
  });

  it('runs a health check written as a list of words without a shell', () => {
    world.healthTest = ['CMD', 'wget', '-q', 'http://127.0.0.1:3000/health'];

    expect(run()).toBe(1);

    expect(called(/^docker exec gpool-web-id wget /)).toHaveLength(3);
    expect(output).toContain(
      '  broken  7  its health check still passes while /tmp/drain exists, so the ingress would keep sending it requests while it stops\n'
    );
  });

  it('finds promise 7 broken when an app cannot write /tmp/drain, or has no health check', () => {
    world.tmpReadOnly = true;

    expect(run()).toBe(1);
    expect(output).toContain(
      '  broken  7  it cannot write /tmp/drain: touch: /tmp/drain: Read-only file system\n'
    );

    output = '';
    world.tmpReadOnly = false;
    world.healthTest = null;

    expect(run()).toBe(1);
    expect(output).toContain(
      '  broken  7  it has no health check, which a deploy waits for and which drains it\n'
    );
  });

  it('drains no app that the ingress does not route', () => {
    for (const service of ['gpool-api', 'gpool-web']) {
      world.model.services[service] = { ...app(service), labels: {} };
    }

    expect(run()).toBe(0);

    expect(called(/ touch \/tmp\/drain$/)).toEqual([]);
    expect(output).toContain(
      '  kept    7  the ingress does not route it, so it has nothing to drain\n'
    );
  });

  it('counts a broken deploy rule of the compose files, and fails', () => {
    world.files['.env.production.example'] = undefined;

    expect(run()).toBe(1);

    expect(output).toContain(
      'the compose files\n  kept    7  compose.yaml names the product gpool'
    );
    expect(output).toContain(
      '  broken  7  there is no .env.production.example beside compose.yaml\n'
    );
    expect(output.endsWith('zigordev contract: 1 promise is broken\n')).toBe(true);
  });

  it('says why compose.yaml and compose.production.yaml cannot be read together', () => {
    world.productionFails = true;

    expect(run()).toBe(1);

    expect(output).toContain(
      '  broken  7  compose.yaml and compose.production.yaml cannot be read together: services.gpool-api.restrt additional property restrt is not allowed\n'
    );
  });

  it('reads no production model when there is no compose.production.yaml', () => {
    world.files['compose.production.yaml'] = undefined;

    expect(run()).toBe(1);

    expect(called(/compose\.production\.yaml/)).toEqual([]);
    expect(output).toContain(
      '  broken  7  there is no compose.production.yaml beside compose.yaml\n'
    );
  });

  it('finds promise 3 broken when the health answer names another version than the app runs', () => {
    world.health = { status: 200, body: '{"status":"ok","version":"unknown"}' };

    expect(run()).toBe(1);

    expect(output).toContain(
      '  broken  3  GET /health names the version unknown, where OTEL_SERVICE_VERSION is local\n'
    );
  });

  it('stops before it starts anything when compose.yaml cannot be read', () => {
    world.configFails = true;

    expect(run()).toBe(1);

    expect(output).toBe(
      'zigordev contract: compose.yaml cannot be read in this folder:\none\ntwo\nno configuration file provided: not found\n'
    );
    expect(calls).toHaveLength(1);
  });

  it('stops when compose.yaml names no app', () => {
    world.model.services = { db: { image: 'postgres:18.1' } };

    expect(run()).toBe(1);

    expect(output).toBe(
      'zigordev contract: compose.yaml names no app, which is a service that runs an image of ghcr.io/zigordev/\n'
    );
  });

  it('stops when compose.yaml gives an app no PORT', () => {
    world.model.services['gpool-web'] = {
      image: 'ghcr.io/zigordev/gpool-web:local',
      environment: { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://alloy:4318' },
    };

    expect(run()).toBe(1);

    expect(output).toBe('zigordev contract: compose.yaml gives gpool-web no PORT\n');
  });

  it('stops when the apps do not send their telemetry to one address', () => {
    world.model.services['gpool-web'] = {
      image: 'ghcr.io/zigordev/gpool-web:local',
      environment: { PORT: '3000' },
    };

    expect(run()).toBe(1);

    expect(output).toBe(
      'zigordev contract: the apps do not all name one address for their telemetry, in OTEL_EXPORTER_OTLP_ENDPOINT\n'
    );
  });

  it('stops when Docker does not answer', () => {
    world.dockerDown = true;

    expect(run()).toBe(1);

    expect(output).toBe(
      'zigordev contract: Docker does not answer. Start it, then run this again:\nCannot connect to the Docker daemon at unix:///var/run/docker.sock.\n'
    );
    expect(called(/ up /)).toEqual([]);
  });

  it('removes a copy without settings that an interrupted run left, before it starts one', () => {
    run();

    const bare = 'gpool-contract-gpool-api-bare';
    expect(calls.indexOf(`docker rm --force ${bare}`)).toBeLessThan(
      calls.findIndex((call) => call.startsWith(`docker run --detach --name ${bare} `))
    );
  });

  it('stops, and says how to build, when an image is not on the machine', () => {
    world.missingImage = 'ghcr.io/zigordev/gpool-web:local';

    expect(run()).toBe(1);

    expect(output).toBe(
      'zigordev contract: the image ghcr.io/zigordev/gpool-web:local is not on this machine. Build it first:\n  docker compose --file compose.yaml --file compose.local.yaml build\n'
    );
    expect(called(/ up /)).toEqual([]);
  });

  it('says why the product did not start, and still removes what it started', () => {
    world.upFails = true;

    expect(run()).toBe(1);

    expect(output).toBe(
      'zigordev contract: the product did not start and get healthy:\na\nb\ncontainer gpool-contract-gpool-api-1 is unhealthy\n'
    );
    expect(calls.at(-1)).toMatch(/ down --volumes --remove-orphans --timeout 1$/);
    expect(existsSync(dirname(overridePath))).toBe(false);
  });
});
