import { existsSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { repoFiles } from './files.ts';
import type { Finding, Rule } from './rule.ts';
import { rulesWith } from './rules/index.ts';
import { sharedFiles, sync } from './shared.ts';

export interface Io {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly shared: string;
  readonly write: (text: string) => void;
}

function usage(rules: readonly Rule[]): string {
  return [
    'Usage: zigordev check [rule...] [file...]',
    '       zigordev sync',
    '',
    'check  With no rule, every rule runs. With files, the rules that read files read only those.',
    'sync   Copies the shared files of @zigordev/dev into this repo.',
    '',
    'Rules:',
    ...rules.map((rule) => `  ${rule.name.padEnd(13)}${rule.summary}`),
    '',
  ].join('\n');
}

function place(finding: Finding): string {
  return finding.line === undefined ? finding.path : `${finding.path}:${finding.line}`;
}

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

function check(args: readonly string[], rules: readonly Rule[], io: Io): number {
  const names = new Set(rules.map((rule) => rule.name));
  const chosen = args.filter((arg) => names.has(arg));
  const paths = args.filter((arg) => !names.has(arg));
  const unknown = paths.find((path) => !isFile(resolve(io.cwd, path)));
  if (unknown !== undefined) {
    io.write(`zigordev check: "${unknown}" is neither a rule nor a file\n\n${usage(rules)}`);
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

function copy(io: Io): number {
  if (sharedFiles(io.shared).length === 0) {
    io.write(`zigordev sync: the package holds no shared files in ${io.shared}\n`);
    return 1;
  }
  const written = sync(io.cwd, io.shared);
  for (const path of written) {
    io.write(`updated  ${path}\n`);
  }
  io.write(
    written.length === 0
      ? 'zigordev sync: every shared file is up to date\n'
      : `zigordev sync: ${written.length} ${written.length === 1 ? 'file' : 'files'} updated\n`
  );
  return 0;
}

export function main(argv: readonly string[], io: Io): number {
  const [command, ...rest] = argv;
  const rules = rulesWith(io.shared);
  if (command === 'check') {
    return check(rest, rules, io);
  }
  if (command === 'sync' && rest.length === 0) {
    return copy(io);
  }
  io.write(usage(rules));
  return command === undefined || command === 'help' || command === '--help' ? 0 : 2;
}
