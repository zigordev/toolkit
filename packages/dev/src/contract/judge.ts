import type { Answer, Held, Received } from './agent.ts';

export interface Evidence {
  readonly service: string;
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

function healthy(answer: Answer): boolean {
  if (answer.status !== 200) {
    return false;
  }
  try {
    const body = JSON.parse(answer.body) as { status?: unknown };
    return body.status === 'ok' || body.status === 'degraded';
  } catch {
    return false;
  }
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
  return kept(3, `it listens on the port in PORT, and answers GET /health with 200`);
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

export function judge(evidence: Evidence): Verdict[] {
  return [
    image(evidence),
    settings(evidence),
    health(evidence),
    logs(evidence),
    telemetry(evidence),
    stop(evidence),
  ];
}
