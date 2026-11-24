import type { Answer, Held, Received } from './agent.ts';

export interface Drain {
  readonly test: readonly string[];
  readonly touched: { readonly status: number; readonly stderr: string };
  readonly before: number;
  readonly during: number;
  readonly after: number;
}

export interface Evidence {
  readonly service: string;
  readonly version: string | undefined;
  readonly drain: Drain | undefined;
  readonly architecture: string;
  readonly user: string;
  readonly bare: { readonly status: string; readonly code: number };
  readonly port: string;
  readonly health: Answer;
  readonly moved: Answer;
  readonly stdout: string;
  readonly stderr: string;
  readonly received: readonly Received[];
  readonly stop: { readonly code: number; readonly seconds: number; readonly held: Held };
}

export interface JobEvidence {
  readonly service: string;
  readonly waitedForBy: readonly string[];
  readonly status: string;
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface Verdict {
  readonly promise: number;
  readonly kept: boolean;
  readonly detail: string;
}

export const visitor = {
  address: '203.0.113.9',
  email: 'ada@example.com',
  agent: 'contract-visitor/1.0',
  code: 'code-51ac',
};

export const marks = [
  visitor.address,
  visitor.email,
  'ada%40example.com',
  visitor.agent,
  visitor.code,
];
const grace = 30;

function kept(promise: number, detail: string): Verdict {
  return { promise, kept: true, detail };
}

function broken(promise: number, detail: string): Verdict {
  return { promise, kept: false, detail };
}

function short(text: string): string {
  const line = text.trim().split('\n')[0] ?? '';
  return line.length > 120 ? `${line.slice(0, 120)}...` : line;
}

function isRoot(user: string): boolean {
  const name = user.split(':')[0] ?? '';
  return name === '' || name === '0' || name === 'root';
}

function image(evidence: Evidence): Verdict {
  if (evidence.architecture !== 'arm64') {
    return broken(1, `the image is built for ${evidence.architecture || 'nothing'}, not for arm64`);
  }
  if (isRoot(evidence.user)) {
    return broken(1, 'the container runs as root');
  }
  return kept(1, `an arm64 image that runs as the user ${evidence.user}`);
}

function settings(evidence: Evidence): Verdict {
  const { status, code } = evidence.bare;
  if (status !== 'exited') {
    return broken(2, 'it keeps running without its settings, when it should stop at once');
  }
  if (code === 0) {
    return broken(2, 'without its settings it stops with code 0, as if nothing were wrong');
  }
  return kept(2, `without its settings it stops at once, with code ${code}`);
}

function bodyOf(answer: Answer): { status?: unknown; version?: unknown } {
  try {
    const body: unknown = JSON.parse(answer.body);
    return typeof body === 'object' && body !== null ? body : {};
  } catch {
    return {};
  }
}

function healthy(answer: Answer): boolean {
  const { status } = bodyOf(answer);
  return answer.status === 200 && (status === 'ok' || status === 'degraded');
}

function said(answer: Answer): string {
  if (answer.status === 0) {
    return `gave no answer (${short(answer.body)})`;
  }
  return answer.status === 200
    ? 'answered 200, with a body that names no status of ok or degraded'
    : `answered ${answer.status}, not 200`;
}

function health(evidence: Evidence): Verdict {
  if (!healthy(evidence.health)) {
    return broken(3, `GET /health on port ${evidence.port} ${said(evidence.health)}`);
  }
  if (!healthy(evidence.moved)) {
    return broken(
      3,
      `started with another PORT, GET /health there ${said(evidence.moved)}, so it does not listen on the port it is given`
    );
  }
  const named = bodyOf(evidence.health).version;
  if (typeof named !== 'string' || named === '') {
    return broken(3, 'GET /health names no version, which the deploy asks for from outside');
  }
  if (evidence.version !== undefined && named !== evidence.version) {
    return broken(
      3,
      `GET /health names the version ${named}, where OTEL_SERVICE_VERSION is ${evidence.version}`
    );
  }
  return kept(
    3,
    `it listens on the port in PORT, and answers GET /health with 200 and its version ${named}`
  );
}

function isJsonObject(line: string): boolean {
  try {
    const value: unknown = JSON.parse(line);
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  } catch {
    return false;
  }
}

function logs(evidence: Evidence): Verdict {
  const lines = evidence.stdout.split('\n').filter((line) => line.trim() !== '');
  const plain = lines.find((line) => !isJsonObject(line));
  if (plain !== undefined) {
    return broken(4, `a line on standard output is not JSON: "${short(plain)}"`);
  }
  if (evidence.stderr.trim() !== '') {
    return broken(4, `it writes to the error output: "${short(evidence.stderr)}"`);
  }
  const mark = marks.find((value) => evidence.stdout.includes(value));
  if (mark !== undefined) {
    return broken(4, `its lines hold what a visitor sent: "${mark}"`);
  }
  return kept(
    4,
    `${lines.length} ${lines.length === 1 ? 'line' : 'lines'}, all JSON, with nothing a visitor sent`
  );
}

function telemetry(evidence: Evidence): Verdict {
  const own = evidence.received.filter((entry) => entry.found.includes(evidence.service));
  for (const [path, kind] of [
    ['/v1/traces', 'trace'],
    ['/v1/metrics', 'metric'],
  ] as const) {
    if (!own.some((entry) => entry.path === path)) {
      return broken(5, `no ${kind} reached the agent under the name ${evidence.service}`);
    }
  }
  const mark = marks.find((value) => own.some((entry) => entry.found.includes(value)));
  if (mark !== undefined) {
    return broken(5, `its telemetry holds what a visitor sent: "${mark}"`);
  }
  return kept(5, `traces and metrics reached the agent under the name ${evidence.service}`);
}

function stop(evidence: Evidence): Verdict {
  const { code, seconds, held } = evidence.stop;
  if (code === 137 || seconds >= grace) {
    return broken(6, `it did not stop within ${grace} seconds of a SIGTERM, and was killed`);
  }
  if (code !== 0 && code !== 143) {
    return broken(6, `it stopped with code ${code} after a SIGTERM, which is neither 0 nor 143`);
  }
  if (held.response === undefined) {
    return broken(
      6,
      `it cut off a request that had begun before the SIGTERM: ${held.failure ?? 'no answer'}`
    );
  }
  return kept(
    6,
    `it stopped ${seconds.toFixed(1)} s after a SIGTERM with code ${code}, and answered the request it had begun`
  );
}

function drain(evidence: Evidence): Verdict {
  const found = evidence.drain;
  if (found === undefined) {
    return kept(7, 'the ingress does not route it, so it has nothing to drain');
  }
  if (found.test.length === 0) {
    return broken(7, 'it has no health check, which a deploy waits for and which drains it');
  }
  if (found.before !== 0) {
    return broken(7, `its health check fails with code ${found.before} while it is healthy`);
  }
  if (found.touched.status !== 0) {
    return broken(7, `it cannot write /tmp/drain: ${short(found.touched.stderr) || 'no reason'}`);
  }
  if (found.during === 0) {
    return broken(
      7,
      'its health check still passes while /tmp/drain exists, so the ingress would keep sending it requests while it stops'
    );
  }
  if (found.after !== 0) {
    return broken(
      7,
      `its health check still fails with code ${found.after} once /tmp/drain is gone`
    );
  }
  return kept(
    7,
    'its health check fails while /tmp/drain exists, and passes again once it is gone'
  );
}

export function judge(evidence: Evidence): Verdict[] {
  return [
    image(evidence),
    settings(evidence),
    health(evidence),
    logs(evidence),
    telemetry(evidence),
    stop(evidence),
    drain(evidence),
  ];
}

function ended(evidence: JobEvidence): Verdict {
  if (evidence.waitedForBy.length === 0) {
    return broken(
      1,
      'no service waits for it with depends_on and the condition service_completed_successfully'
    );
  }
  if (evidence.status !== 'exited') {
    return broken(1, `it is still ${evidence.status || 'missing'} after the product started`);
  }
  if (evidence.code !== 0) {
    return broken(1, `it ended with code ${evidence.code}`);
  }
  return kept(1, `it ended with code 0 before ${evidence.waitedForBy.join(' and ')} started`);
}

function jobLines(evidence: JobEvidence): Verdict {
  const lines = `${evidence.stdout}\n${evidence.stderr}`
    .split('\n')
    .filter((line) => line.trim() !== '');
  const plain = lines.find((line) => !isJsonObject(line));
  if (plain !== undefined) {
    return broken(2, `a line it printed is not JSON: "${short(plain)}"`);
  }
  return kept(2, `${lines.length} ${lines.length === 1 ? 'line' : 'lines'}, all JSON`);
}

export function judgeJob(evidence: JobEvidence): Verdict[] {
  return [ended(evidence), jobLines(evidence)];
}
