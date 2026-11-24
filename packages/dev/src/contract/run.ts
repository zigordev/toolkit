import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import type { Outcome, Run } from '../release.ts';
import type { Answer, Held, Received } from './agent.ts';
import { judgeCompose, type RawModel } from './compose.ts';
import {
  type Drain,
  type Evidence,
  type JobEvidence,
  judge,
  judgeJob,
  marks,
  type Verdict,
  visitor,
} from './judge.ts';
import {
  type App,
  agentAddress,
  agentService,
  overrideFor,
  ownImages,
  readProduct,
} from './product.ts';

export interface ContractIo {
  readonly cwd: string;
  readonly run: Run;
  readonly read: (file: string) => string | undefined;
  readonly write: (text: string) => void;
  readonly sleep: (milliseconds: number) => void;
  readonly now: () => number;
  readonly agentScript: string;
  readonly node: string;
}

const build = 'docker compose --file compose.yaml --file compose.local.yaml build';
const noAnswer: Answer = { status: 0, body: 'the agent gave no answer' };

function lastLines(text: string): string {
  return text.trim().split('\n').slice(-8).join('\n');
}

function parsed<T>(outcome: Outcome, otherwise: T): T {
  try {
    return JSON.parse(outcome.stdout) as T;
  } catch {
    return otherwise;
  }
}

function fail(io: ContractIo, message: string): number {
  io.write(`zigordev contract: ${message}\n`);
  return 1;
}

function report(io: ContractIo, verdicts: readonly Verdict[]): number {
  for (const verdict of verdicts) {
    io.write(`  ${verdict.kept ? 'kept  ' : 'broken'}  ${verdict.promise}  ${verdict.detail}\n`);
  }
  return verdicts.filter((verdict) => !verdict.kept).length;
}

function composeVerdicts(io: ContractIo, docker: (...args: string[]) => Outcome): Verdict[] {
  const production = io.read('compose.production.yaml');
  const merged =
    production === undefined
      ? undefined
      : docker(
          'compose',
          '--file',
          'compose.yaml',
          '--file',
          'compose.production.yaml',
          'config',
          '--format',
          'json',
          '--no-interpolate'
        );
  return judgeCompose({
    compose: io.read('compose.yaml'),
    production,
    example: io.read('.env.production.example'),
    model: merged?.status === 0 ? parsed<RawModel | undefined>(merged, undefined) : undefined,
    problem: merged === undefined ? undefined : lastLines(merged.stderr),
  });
}

export function contract(io: ContractIo): number {
  const docker = (...args: string[]): Outcome => io.run('docker', args, io.cwd);
  const until = <T>(seconds: number, attempt: () => T | undefined): T | undefined => {
    const deadline = io.now() + seconds * 1000;
    for (;;) {
      const result = attempt();
      if (result !== undefined || io.now() >= deadline) {
        return result;
      }
      io.sleep(250);
    }
  };

  const config = docker('compose', '--file', 'compose.yaml', 'config', '--format', 'json');
  if (config.status !== 0) {
    return fail(io, `compose.yaml cannot be read in this folder:\n${lastLines(config.stderr)}`);
  }
  const product = readProduct(config.stdout);
  if (product.apps.length === 0) {
    return fail(
      io,
      `compose.yaml names no app, which is a service that runs an image of ${ownImages}`
    );
  }
  const portless = product.apps.find((app) => app.port === undefined);
  if (portless !== undefined) {
    return fail(io, `compose.yaml gives ${portless.service} no PORT`);
  }
  const address = agentAddress(product);
  if (address === undefined) {
    return fail(
      io,
      'the apps do not all name one address for their telemetry, in OTEL_EXPORTER_OTLP_ENDPOINT'
    );
  }
  const daemon = docker('version', '--format', '{{.Server.Version}}');
  if (daemon.status !== 0) {
    return fail(
      io,
      `Docker does not answer. Start it, then run this again:\n${lastLines(daemon.stderr)}`
    );
  }
  const architectures = new Map<string, string>();
  for (const app of product.apps) {
    const inspected = docker('image', 'inspect', '--format', '{{.Architecture}}', app.image);
    if (inspected.status !== 0) {
      return fail(io, `the image ${app.image} is not on this machine. Build it first:\n  ${build}`);
    }
    architectures.set(app.service, inspected.stdout.trim());
  }

  const project = `${product.name}-contract`;
  const folder = mkdtempSync(join(tmpdir(), 'zigordev-contract-'));
  const override = join(folder, 'compose.contract.json');
  const target = `/contract/agent${extname(io.agentScript) === '.ts' ? '.mts' : '.mjs'}`;
  const agentPort = address.port || '80';
  writeFileSync(
    override,
    JSON.stringify(
      overrideFor(product, project, {
        image: `node:${io.node}-alpine`,
        script: io.agentScript,
        target,
        host: address.hostname,
        port: agentPort,
      })
    )
  );
  const compose = (...args: string[]): Outcome =>
    docker(
      'compose',
      '--project-name',
      project,
      '--file',
      'compose.yaml',
      '--file',
      override,
      ...args
    );
  const extras: string[] = [];

  try {
    compose('down', '--volumes', '--remove-orphans', '--timeout', '1');
    const up = compose('up', '--detach', '--wait', '--wait-timeout', '120', '--no-build');
    if (up.status !== 0) {
      return fail(io, `the product did not start and get healthy:\n${lastLines(up.stderr)}`);
    }
    const containerOf = (service: string): string =>
      compose('ps', '--all', '--quiet', service).stdout.trim().split('\n')[0] ?? '';
    const jobs: JobEvidence[] = product.jobs.map((job) => {
      const container = containerOf(job.service);
      const [status = '', code = ''] = docker(
        'inspect',
        '--format',
        '{{.State.Status}} {{.State.ExitCode}}',
        container
      )
        .stdout.trim()
        .split(' ');
      const printed = docker('logs', container);
      return {
        service: job.service,
        waitedForBy: job.waitedForBy,
        status,
        code: Number(code),
        stdout: printed.stdout,
        stderr: printed.stderr,
      };
    });
    const agent = containerOf(agentService);
    const inAgent = (...args: string[]): Outcome => docker('exec', agent, 'node', target, ...args);
    const ask = (url: string, ...who: string[]): Answer =>
      parsed(inAgent('ask', url, ...who), noAnswer);
    const received = (): Received[] =>
      parsed(
        inAgent('received', agentPort, ...product.apps.map((app) => app.service), ...marks),
        []
      );
    const healthAt = (host: string, port: string): Answer => ask(`http://${host}:${port}/health`);
    const drainOf = (container: string): Drain => {
      const test =
        parsed<string[] | null>(
          docker('inspect', '--format', '{{json .Config.Healthcheck.Test}}', container),
          null
        ) ?? [];
      const check = (): number => {
        if (test[0] === 'CMD-SHELL') {
          return docker('exec', container, '/bin/sh', '-c', test[1] ?? 'false').status;
        }
        return docker('exec', container, ...test.slice(1)).status;
      };
      if (test[0] !== 'CMD-SHELL' && test[0] !== 'CMD') {
        return { test: [], touched: { status: 1, stderr: '' }, before: 1, during: 1, after: 1 };
      }
      const before = check();
      const touched = docker('exec', container, 'touch', '/tmp/drain');
      const during = check();
      docker('exec', container, 'rm', '-f', '/tmp/drain');
      const after = check();
      return {
        test,
        touched: { status: touched.status, stderr: touched.stderr },
        before,
        during,
        after,
      };
    };

    const probe = (app: App & { port: string }) => {
      const container = containerOf(app.service);
      const drain = app.routed ? drainOf(container) : undefined;
      const query = `email=${visitor.email}&code=${visitor.code}`;
      ask(`http://${app.service}:${app.port}/?${query}`, 'visitor');
      ask(`http://${app.service}:${app.port}/contract-probe?${query}`, 'visitor');
      const health = healthAt(app.service, app.port);

      const moved = `${project}-${app.service}-moved`;
      const other = String(Number(app.port) + 1);
      extras.push(moved);
      compose(
        'run',
        '--detach',
        '--no-TTY',
        '--no-deps',
        '--name',
        moved,
        '--env',
        `PORT=${other}`,
        app.service
      );
      const movedHealth =
        until(30, () => {
          const answer = healthAt(moved, other);
          return answer.status === 200 ? answer : undefined;
        }) ?? healthAt(moved, other);
      docker('rm', '--force', moved);

      const bare = `${project}-${app.service}-bare`;
      extras.push(bare);
      docker('rm', '--force', bare);
      docker('run', '--detach', '--name', bare, '--network', 'none', app.image);
      const state = (): string =>
        docker('inspect', '--format', '{{.State.Status}} {{.State.ExitCode}}', bare).stdout.trim();
      const ended =
        until(15, () => (state().startsWith('exited') ? state() : undefined)) ?? state();
      docker('rm', '--force', bare);
      const [status = '', code = ''] = ended.split(' ');

      return {
        app,
        container,
        drain,
        user: docker('inspect', '--format', '{{.Config.User}}', container).stdout.trim(),
        health,
        moved: movedHealth,
        bare: { status, code: Number(code) },
      };
    };
    const probed = product.apps.map((app) => probe({ ...app, port: app.port ?? '' }));

    const complete = (entries: readonly Received[]): boolean =>
      product.apps.every((app) =>
        ['/v1/traces', '/v1/metrics'].every((path) =>
          entries.some((entry) => entry.path === path && entry.found.includes(app.service))
        )
      );
    until(20, () => (complete(received()) ? true : undefined));

    const evidence: Evidence[] = probed.map(
      ({ app, container, drain, user, health, moved, bare }) => {
        const file = `/tmp/held-${app.service}.json`;
        docker(
          'exec',
          '--detach',
          agent,
          'node',
          target,
          'hold',
          app.service,
          app.port,
          '1500',
          file
        );
        until(5, () =>
          docker('exec', agent, 'test', '-f', `${file}.sent`).status === 0 ? true : undefined
        );
        const asked = io.now();
        docker('stop', '--timeout', '30', container);
        const seconds = (io.now() - asked) / 1000;
        const code = Number(
          docker('inspect', '--format', '{{.State.ExitCode}}', container).stdout.trim()
        );
        const read = until(5, () => {
          const outcome = docker('exec', agent, 'cat', file);
          return outcome.status === 0 ? outcome : undefined;
        });
        const held: Held =
          read === undefined
            ? { failure: 'the request never got an answer' }
            : parsed(read, { failure: 'the request never got an answer' });
        const printed = docker('logs', container);
        return {
          service: app.service,
          version: app.version,
          drain,
          architecture: architectures.get(app.service) ?? '',
          user,
          bare,
          port: app.port,
          health,
          moved,
          stdout: printed.stdout,
          stderr: printed.stderr,
          received: [],
          stop: { code, seconds, held },
        };
      }
    );
    const sent = received();

    io.write('the compose files\n');
    let brokenCount = report(io, composeVerdicts(io, docker));
    for (const entry of evidence) {
      io.write(`${entry.service}\n`);
      brokenCount += report(io, judge({ ...entry, received: sent }));
    }
    for (const entry of jobs) {
      io.write(`${entry.service}, a job\n`);
      brokenCount += report(io, judgeJob(entry));
    }
    if (brokenCount === 0) {
      const apps = product.apps.length === 1 ? '1 app keeps' : `${product.apps.length} apps keep`;
      const jobsKeep =
        jobs.length === 0
          ? ''
          : `, and ${jobs.length === 1 ? '1 job keeps' : `${jobs.length} jobs keep`} promises 1 and 2`;
      const composeKeeps =
        jobs.length === 0
          ? ', and the compose files keep promise 7'
          : ', the compose files keep promise 7';
      io.write(`zigordev contract: ${apps} promises 1 to 7${composeKeeps}${jobsKeep}\n`);
      return 0;
    }
    io.write(
      `zigordev contract: ${brokenCount === 1 ? '1 promise is' : `${brokenCount} promises are`} broken\n`
    );
    return 1;
  } finally {
    for (const name of extras) {
      docker('rm', '--force', name);
    }
    compose('down', '--volumes', '--remove-orphans', '--timeout', '1');
    rmSync(folder, { recursive: true, force: true });
  }
}
