import { appendFileSync, existsSync, statSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';
import { repoFiles } from './files.ts';
import { firstPublish, type Interact } from './first-publish.ts';
import { pack, plan, type Run } from './release.ts';
import type { Finding, Rule } from './rule.ts';
import { rulesWith } from './rules/index.ts';
import { sharedFiles, sync } from './shared.ts';

export interface Io {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly shared: string;
  readonly run: Run;
  readonly interact: Interact;
  readonly atTerminal: boolean;
  readonly write: (text: string) => void;
}

function usage(rules: readonly Rule[]): string {
  return [
    'Usage: zigordev check [rule...] [file...]',
    '       zigordev sync',
    '       zigordev release plan',
    '       zigordev release pack <folder> <version>',
    '       zigordev first-publish [--dry-run] <package...>',
    '',
    'check          With no rule, every rule runs. With files, the rules that read files read only those.',
    'sync           Copies the shared files of @zigordev/dev into this repo.',
    'release        plan says which public packages are missing on npm at the latest tagged version.',
    '               pack writes the tarballs of the missing ones into a folder, at the version given.',
    'first-publish  Puts an empty first version of a new package on npm and ties its name to this repo.',
    '               Only the owner of the npm account runs it. With --dry-run it changes nothing.',
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

function count(amount: number, noun: string): string {
  return `${amount} ${noun}${amount === 1 ? '' : 's'}`;
}

function planRelease(io: Io): number {
  const { packages, version, missing } = plan(io.cwd, io.run);
  if (io.env.GITHUB_OUTPUT !== undefined) {
    appendFileSync(
      io.env.GITHUB_OUTPUT,
      `public=${packages.length}\nversion=${version ?? ''}\npublish=${missing.length > 0}\n`
    );
  }
  if (packages.length === 0) {
    io.write('zigordev release: no package is public, so nothing is released\n');
  } else if (version === undefined) {
    io.write(
      `zigordev release: ${count(packages.length, 'public package')}, and no version is tagged yet\n`
    );
  } else if (missing.length === 0) {
    io.write(`zigordev release: every public package is on npm at ${version}\n`);
  } else {
    for (const pkg of missing) {
      io.write(`missing  ${pkg.name}@${version}\n`);
    }
    io.write(`zigordev release: ${count(missing.length, 'package')} to publish at ${version}\n`);
  }
  return 0;
}

function packRelease(folder: string, version: string, io: Io): number {
  const tarballs = pack(io.cwd, folder, version, io.run);
  for (const tarball of tarballs) {
    io.write(`packed  ${basename(tarball)}\n`);
  }
  io.write(
    tarballs.length === 0
      ? `zigordev release: every public package is on npm at ${version}, so nothing was packed\n`
      : `zigordev release: ${count(tarballs.length, 'package')} packed into ${folder}\n`
  );
  return 0;
}

function release(args: readonly string[], io: Io): number | undefined {
  const [action, folder, version, ...rest] = args;
  try {
    if (action === 'plan' && folder === undefined) {
      return planRelease(io);
    }
    if (action === 'pack' && folder !== undefined && version !== undefined && rest.length === 0) {
      return packRelease(folder, version, io);
    }
  } catch (error) {
    io.write(`zigordev release: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  return undefined;
}

function publishFirst(args: readonly string[], io: Io): number | undefined {
  const dryRun = args[0] === '--dry-run';
  const names = dryRun ? args.slice(1) : args;
  if (names.length === 0 || names.some((name) => name.startsWith('-'))) {
    return undefined;
  }
  try {
    firstPublish(io.cwd, names, dryRun, io);
  } catch (error) {
    io.write(`zigordev first-publish: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  io.write(
    dryRun
      ? 'zigordev first-publish: this was a dry run, so nothing was changed\n'
      : `zigordev first-publish: ${count(names.length, 'package')} tied. The pipeline has to publish within 2 days, or the tie expires\n`
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
  if (command === 'release') {
    const code = release(rest, io);
    if (code !== undefined) {
      return code;
    }
  }
  if (command === 'first-publish') {
    const code = publishFirst(rest, io);
    if (code !== undefined) {
      return code;
    }
  }
  io.write(usage(rules));
  return command === undefined || command === 'help' || command === '--help' ? 0 : 2;
}
