import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Call {
  readonly tool: string;
  readonly args: readonly string[];
}

export interface StepRun {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly outputs: Readonly<Record<string, string>>;
  readonly summary: string;
  readonly calls: readonly Call[];
  readonly seconds: number;
}

export interface HostCommand {
  readonly unclaimed?: number;
  readonly statuses?: readonly string[];
  readonly output?: string;
}

export interface Scenario {
  readonly denied?: boolean;
  readonly buildFails?: boolean;
  readonly digests?: Readonly<Record<string, string>>;
  readonly attested?: readonly string[];
  readonly commands?: Readonly<Record<string, HostCommand>>;
  readonly health?: readonly { readonly status: number; readonly body?: string }[];
  readonly sleepFactor?: number;
}

export interface StepOptions {
  readonly env: Readonly<Record<string, string>>;
  readonly scenario?: Scenario;
  readonly cwd: string;
}

const standIn = fileURLToPath(new URL('./stand-in.sh', import.meta.url));
const start = 1_700_000_000;

export const realDocker = execFileSync('sh', ['-c', 'command -v docker'], {
  encoding: 'utf8',
}).trim();

export function stepScript(workflow: string, step: string): string {
  const lines = workflow.split('\n');
  const first = lines.findIndex((line) => line.trim() === `- name: ${step}`);
  if (first === -1) {
    throw new Error(`the workflow has no step named "${step}"`);
  }
  const stepIndent = lines[first]?.indexOf('-') ?? 0;
  let index = first + 1;
  for (; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const indent = line.search(/\S/);
    if (indent !== -1 && indent <= stepIndent) {
      throw new Error(`the step "${step}" has no script of several lines`);
    }
    if (/^\s+run: \|$/.test(line)) {
      break;
    }
  }
  const runIndent = (lines[index] ?? '').search(/\S/);
  const body: string[] = [];
  for (index += 1; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const indent = line.search(/\S/);
    if (indent !== -1 && indent <= runIndent) {
      break;
    }
    body.push(line);
  }
  const margin = Math.min(
    ...body.filter((line) => line.trim() !== '').map((line) => line.search(/\S/))
  );
  return `${body
    .map((line) => line.slice(margin))
    .join('\n')
    .trimEnd()}\n`;
}

function executable(path: string, content: string): void {
  writeFileSync(path, content);
  chmodSync(path, 0o755);
}

function readIfThere(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function lay(folder: string, scenario: Scenario): void {
  const put = (name: string, content: string) => writeFileSync(join(folder, name), content);
  put('docker', `${realDocker}\n`);
  put('sleep-factor', `${scenario.sleepFactor ?? 1}\n`);
  put('clock', `${start}\n`);
  put(
    'digests',
    Object.entries(scenario.digests ?? {})
      .map(([reference, digest]) => `${reference} ${digest}\n`)
      .join('')
  );
  put('attested', (scenario.attested ?? []).map((subject) => `${subject}\n`).join(''));
  if (scenario.denied) {
    put('denied', '');
  }
  if (scenario.buildFails) {
    put('build-fails', '');
  }
  for (const kind of ['deploy', 'rollback']) {
    const command = scenario.commands?.[kind] ?? {};
    put(`command-${kind}-unclaimed`, `${command.unclaimed ?? 0}\n`);
    put(`command-${kind}-statuses`, `${(command.statuses ?? ['Success']).join('\n')}\n`);
    put(`command-${kind}-output`, command.output ?? '');
  }
  const health = scenario.health ?? [{ status: 0 }];
  put('health-count', `${health.length}\n`);
  health.forEach((answer, index) => {
    put(`health-${index}-status`, `${answer.status}\n`);
    put(`health-${index}-body`, answer.body ?? '');
  });
}

export function runStep(script: string, options: StepOptions): StepRun {
  const folder = mkdtempSync(join(tmpdir(), 'zigordev-step-'));
  try {
    const bin = join(folder, 'bin');
    mkdirSync(bin);
    mkdirSync(join(folder, 'temp'));
    for (const tool of ['aws', 'docker', 'gh', 'curl']) {
      executable(join(bin, tool), `#!/bin/sh\nexec bash "${standIn}" ${tool} "$@"\n`);
    }
    executable(join(bin, 'date'), '#!/bin/bash\nread -r now <"$STAND_IN/clock"\necho "$now"\n');
    executable(
      join(bin, 'sleep'),
      '#!/bin/bash\nread -r now <"$STAND_IN/clock"\nread -r factor <"$STAND_IN/sleep-factor"\necho $((now + $1 * factor)) >"$STAND_IN/clock"\n'
    );
    lay(folder, options.scenario ?? {});
    writeFileSync(join(folder, 'step.sh'), script);
    const ran = spawnSync(
      'bash',
      ['--noprofile', '--norc', '-eo', 'pipefail', join(folder, 'step.sh')],
      {
        cwd: options.cwd,
        encoding: 'utf8',
        env: {
          PATH: `${bin}:${process.env.PATH ?? ''}`,
          HOME: process.env.HOME ?? folder,
          STAND_IN: folder,
          RUNNER_TEMP: join(folder, 'temp'),
          GITHUB_OUTPUT: join(folder, 'output'),
          GITHUB_STEP_SUMMARY: join(folder, 'summary'),
          ...options.env,
        },
      }
    );
    const outputs = Object.fromEntries(
      readIfThere(join(folder, 'output'))
        .split('\n')
        .filter((line) => line.includes('='))
        .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)])
    );
    const calls = readIfThere(join(folder, 'calls'))
      .split('\u001e')
      .filter((record) => record !== '')
      .map((record) => {
        const [tool = '', ...args] = record.split('\u001f');
        return { tool, args };
      });
    return {
      code: ran.status,
      stdout: ran.stdout,
      stderr: ran.stderr,
      outputs,
      summary: readIfThere(join(folder, 'summary')),
      calls,
      seconds: Number(readFileSync(join(folder, 'clock'), 'utf8').trim()) - start,
    };
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}
