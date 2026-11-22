import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Run } from './release.ts';

export type Interact = (command: string, args: readonly string[], cwd: string) => number;

export interface Tools {
  readonly run: Run;
  readonly interact: Interact;
  readonly atTerminal: boolean;
  readonly write: (text: string) => void;
}

interface Listed {
  readonly name?: string;
}

export const workflow = 'ci.yml';
export const environment = 'release';
export const firstVersion = '0.0.0';

const oldestNpm = [11, 15, 0] as const;

export function repository(root: string, run: Run): string {
  const outcome = run('git', ['remote', 'get-url', 'origin'], root);
  const match = /github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?$/.exec(outcome.stdout.trim());
  if (outcome.status !== 0 || match?.[1] === undefined) {
    throw new Error('this folder has no remote named origin on github.com');
  }
  return match[1];
}

export function manifest(name: string, repo: string): Record<string, unknown> {
  return {
    name,
    version: firstVersion,
    description: `The first, empty version of this package. The pipeline of ${repo} publishes every later one.`,
    license: 'UNLICENSED',
    repository: { type: 'git', url: `git+https://github.com/${repo}.git` },
  };
}

function isRecentEnough(version: string): boolean {
  const parts = version.split('.').map((part) => Number.parseInt(part, 10));
  for (const [index, least] of oldestNpm.entries()) {
    const part = parts[index] ?? 0;
    if (part !== least) {
      return part > least;
    }
  }
  return true;
}

function checkNpm(root: string, run: Run): void {
  const outcome = run('npm', ['--version'], root);
  const version = outcome.stdout.trim();
  if (outcome.status !== 0 || !isRecentEnough(version)) {
    throw new Error(
      `npm ${version || 'is missing, or'} is older than ${oldestNpm.join('.')}, which is the first that can tie a package to a repo. Run this in the repo's folder, where mise gives the pinned Node.js`
    );
  }
}

function checkNames(root: string, names: readonly string[], run: Run): void {
  const outcome = run('pnpm', ['ls', '-r', '--depth', '-1', '--json'], root);
  if (outcome.status !== 0) {
    throw new Error(`pnpm could not list the packages of this repo: ${outcome.stderr.trim()}`);
  }
  const known = new Set(
    (JSON.parse(outcome.stdout) as readonly Listed[]).map((entry) => entry.name)
  );
  const unknown = names.find((name) => !known.has(name));
  if (unknown !== undefined) {
    throw new Error(`"${unknown}" is not a package of this repo`);
  }
}

function isOnNpm(name: string, root: string, run: Run): boolean {
  const outcome = run('npm', ['view', name, 'name'], root);
  if (outcome.status === 0) {
    return true;
  }
  if (outcome.stderr.includes('E404')) {
    return false;
  }
  throw new Error(`the registry could not say whether ${name} exists: ${outcome.stderr.trim()}`);
}

function must(code: number, what: string): void {
  if (code !== 0) {
    throw new Error(`${what} did not go through, so nothing after it was run`);
  }
}

function publishEmpty(name: string, repo: string, root: string, tools: Tools): void {
  const folder = mkdtempSync(join(tmpdir(), 'zigordev-first-'));
  try {
    writeFileSync(
      join(folder, 'package.json'),
      `${JSON.stringify(manifest(name, repo), null, 2)}\n`
    );
    writeFileSync(
      join(folder, 'README.md'),
      `# ${name}\n\nThis is the first, empty version of this package. The pipeline of [${repo}](https://github.com/${repo}) publishes every later one.\n`
    );
    must(
      tools.interact('npm', ['publish', folder, '--access', 'public'], root),
      `the first publish of ${name}`
    );
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

export function trustArguments(name: string, repo: string): string[] {
  return [
    'trust',
    'github',
    name,
    '--file',
    workflow,
    '--repository',
    repo,
    '--environment',
    environment,
    '--allow-publish',
    '--yes',
  ];
}

export function firstPublish(
  root: string,
  names: readonly string[],
  dryRun: boolean,
  tools: Tools
): void {
  if (!dryRun && !tools.atTerminal) {
    throw new Error(
      'this command signs in to npm and asks for a second factor, so it needs a person at a terminal. With --dry-run it only says what it would do'
    );
  }
  const repo = repository(root, tools.run);
  checkNames(root, names, tools.run);
  checkNpm(root, tools.run);
  if (!dryRun && tools.run('npm', ['whoami'], root).status !== 0) {
    tools.write('npm does not know you on this computer yet, so it asks you to sign in\n');
    must(tools.interact('npm', ['login'], root), 'the sign-in to npm');
  }
  for (const name of names) {
    const there = isOnNpm(name, root, tools.run);
    const tie = trustArguments(name, repo);
    if (dryRun) {
      tools.write(
        there
          ? `${name}  is on npm already, so no first version would be published\n`
          : `${name}  would get an empty ${firstVersion} on npm\n`
      );
      tools.write(`${name}  would run: npm ${tie.join(' ')}\n`);
      continue;
    }
    if (there) {
      tools.write(`${name}  is on npm already\n`);
    } else {
      tools.write(`${name}  is new on npm, so an empty ${firstVersion} is published first\n`);
      publishEmpty(name, repo, root, tools);
    }
    must(tools.interact('npm', tie, root), `the tie between ${name} and ${repo}`);
    tools.write(`${name}  is tied to ${repo}, ${workflow} and the environment ${environment}\n`);
  }
}
