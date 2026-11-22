import { existsSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { repoFiles } from './files.ts';
import type { Finding } from './rule.ts';
import { rules } from './rules/index.ts';

export interface Io {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly write: (text: string) => void;
}

const usage = [
  'Usage: zigordev check [rule...] [file...]',
  '',
  'With no rule, every rule runs. With files, the rules that read files read only those.',
  '',
  'Rules:',
  ...rules.map((rule) => `  ${rule.name.padEnd(10)}${rule.summary}`),
  '',
].join('\n');

function place(finding: Finding): string {
  return finding.line === undefined ? finding.path : `${finding.path}:${finding.line}`;
}

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

function check(args: readonly string[], io: Io): number {
  const names = new Set(rules.map((rule) => rule.name));
  const chosen = args.filter((arg) => names.has(arg));
  const paths = args.filter((arg) => !names.has(arg));
  const unknown = paths.find((path) => !isFile(resolve(io.cwd, path)));
  if (unknown !== undefined) {
    io.write(`zigordev check: "${unknown}" is neither a rule nor a file\n\n${usage}`);
    return 2;
  }
  const active = chosen.length === 0 ? rules : rules.filter((rule) => chosen.includes(rule.name));
  const files =
    paths.length === 0
      ? repoFiles(io.cwd)
      : paths.map((path) => relative(io.cwd, resolve(io.cwd, path)));
  const findings = active
    .flatMap((rule) => rule.run({ root: io.cwd, files, env: io.env }))
    .sort(
      (left, right) => left.path.localeCompare(right.path) || (left.line ?? 0) - (right.line ?? 0)
    );
  const ran = active.map((rule) => rule.name).join(', ');
  if (findings.length === 0) {
    io.write(`zigordev check: no findings (${ran})\n`);
    return 0;
  }
  for (const finding of findings) {
    io.write(`${place(finding)}  ${finding.rule}  ${finding.message}\n`);
  }
  io.write(
    `zigordev check: ${findings.length} ${findings.length === 1 ? 'finding' : 'findings'} (${ran})\n`
  );
  return 1;
}

export function main(argv: readonly string[], io: Io): number {
  const [command, ...rest] = argv;
  if (command === 'check') {
    return check(rest, io);
  }
  io.write(usage);
  return command === undefined || command === 'help' || command === '--help' ? 0 : 2;
}
