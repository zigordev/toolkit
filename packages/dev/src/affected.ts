import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, normalize, relative } from 'node:path';
import type { Run } from './release.ts';

export interface AffectedIo {
  readonly cwd: string;
  readonly run: Run;
  readonly write: (text: string) => void;
}

const toolchain = new Set(['mise.toml']);
const lockfiles = new Set(['pnpm-lock.yaml', 'pnpm-workspace.yaml']);
const code = /\.(?:[cm]?[jt]sx?)$/;
const generated = /(?:^|\/)(?:node_modules|dist|build|coverage|ios|android|\.expo)\//;
const specifier =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"\n]+)\1/g;
const endings = [
  '',
  '.ts',
  '.tsx',
  '.native.ts',
  '.native.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '/index.ts',
  '/index.tsx',
  '/index.js',
];
const shown = 5;

function lines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

function within(file: string, folder: string): boolean {
  return folder === '.' || file === folder || file.startsWith(`${folder}/`);
}

function inAny(file: string, folders: readonly string[]): boolean {
  return folders.some((folder) => within(file, folder));
}

function some(items: readonly string[]): string {
  const more = items.length - shown;
  const listed = items.slice(0, shown).join(', ');
  return more > 0 ? `${listed} and ${more} more` : listed;
}

export function changedFiles(base: string, io: AffectedIo): string[] {
  const diff = io.run('git', ['diff', '--name-only', base, 'HEAD'], io.cwd);
  if (diff.status !== 0) {
    throw new Error(`git cannot compare ${base} with HEAD: ${diff.stderr.trim()}`);
  }
  return lines(diff.stdout);
}

function selectors(paths: readonly string[]): string[] {
  return paths.flatMap((path) => ['--filter-prod', `{${path}}...`]);
}

export function projectsOf(path: string, io: AffectedIo): string[] {
  const listed = io.run(
    'pnpm',
    [...selectors([path]), 'ls', '--depth', '-1', '--parseable'],
    io.cwd
  );
  if (listed.status !== 0) {
    return [];
  }
  return lines(listed.stdout).map((line) => relative(io.cwd, line) || '.');
}

function resolveImport(from: string, spec: string, cwd: string): string | undefined {
  const target = normalize(join(dirname(from), spec));
  for (const ending of endings) {
    const candidate = `${target}${ending}`;
    const path = join(cwd, candidate);
    if (existsSync(path) && statSync(path).isFile()) {
      return candidate;
    }
  }
  return undefined;
}

function trackedFiles(folders: readonly string[], io: AffectedIo): string[] {
  const listed = io.run('git', ['ls-files', '-z', '--', ...folders], io.cwd);
  if (listed.status !== 0) {
    throw new Error(`git cannot list the files of ${folders.join(', ')}: ${listed.stderr.trim()}`);
  }
  return listed.stdout.split('\0').filter((file) => file !== '');
}

export function importsFromOutside(folders: readonly string[], io: AffectedIo): string[] {
  const queue = trackedFiles(folders, io).filter(
    (file) => code.test(file) && !generated.test(file)
  );
  const outside = new Set<string>();
  const read = new Set<string>();
  while (queue.length > 0) {
    const file = queue.shift() ?? '';
    if (read.has(file)) {
      continue;
    }
    read.add(file);
    const text = readFileSync(join(io.cwd, file), 'utf8');
    for (const match of text.matchAll(specifier)) {
      const found = resolveImport(file, match[2] ?? '', io.cwd);
      if (found === undefined || inAny(found, folders) || found.startsWith('..')) {
        continue;
      }
      outside.add(found);
      if (code.test(found)) {
        queue.push(found);
      }
    }
  }
  return [...outside].sort();
}

interface Listed {
  readonly version?: string;
  readonly dependencies?: Readonly<Record<string, Listed>>;
}

function collect(dependencies: Readonly<Record<string, Listed>> | undefined, into: Set<string>) {
  for (const [name, listed] of Object.entries(dependencies ?? {})) {
    const key = `${name}@${listed.version ?? ''}`;
    if (into.has(key)) {
      continue;
    }
    if (!listed.version?.startsWith('link:')) {
      into.add(key);
    }
    collect(listed.dependencies, into);
  }
}

export function packagesOf(projects: readonly string[], cwd: string, run: Run): Set<string> {
  const listed = run(
    'pnpm',
    [...selectors(projects), 'ls', '--lockfile-only', '--prod', '--depth', 'Infinity', '--json'],
    cwd
  );
  const found = new Set<string>();
  if (listed.status !== 0 || listed.stdout.trim() === '') {
    return found;
  }
  let tree: Listed[];
  try {
    tree = JSON.parse(listed.stdout) as Listed[];
  } catch {
    throw new Error(`pnpm listed the packages in ${cwd} in a form that is not JSON`);
  }
  for (const project of tree) {
    collect(project.dependencies, found);
  }
  return found;
}

function packagesAt(base: string, projects: readonly string[], io: AffectedIo): Set<string> {
  const folder = mkdtempSync(join(tmpdir(), 'zigordev-affected-'));
  const added = io.run('git', ['worktree', 'add', '--detach', '--quiet', folder, base], io.cwd);
  try {
    if (added.status !== 0) {
      throw new Error(`git cannot check out ${base}: ${added.stderr.trim()}`);
    }
    return packagesOf(projects, folder, io.run);
  } finally {
    if (added.status === 0) {
      io.run('git', ['worktree', 'remove', '--force', folder], io.cwd);
    }
    rmSync(folder, { recursive: true, force: true });
  }
}

function difference(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((key) => !right.has(key)).sort();
}

export function affected(paths: readonly string[], base: string, io: AffectedIo): number {
  const changed = changedFiles(base, io);
  const listed = paths.map((path) => ({ path, projects: projectsOf(path, io) }));
  const projects = [...new Set(listed.flatMap((entry) => entry.projects))].sort();
  const plain = listed.filter((entry) => entry.projects.length === 0).map((entry) => entry.path);
  const reasons: string[] = [];

  const inside = changed.filter((file) => inAny(file, [...projects, ...plain]));
  if (inside.length > 0) {
    reasons.push(`Changed in the folders: ${some(inside)}`);
  }

  if (projects.length > 0) {
    const borrowed = new Set(importsFromOutside(projects, io));
    const touched = changed.filter((file) => borrowed.has(file));
    if (touched.length > 0) {
      reasons.push(`Changed, and imported from outside the folders: ${some(touched)}`);
    }
    const tools = changed.filter((file) => toolchain.has(file));
    if (tools.length > 0) {
      reasons.push(`Changed, and pins the tools of every build: ${some(tools)}`);
    }
    if (changed.some((file) => lockfiles.has(file))) {
      const now = packagesOf(projects, io.cwd, io.run);
      const before = packagesAt(base, projects, io);
      const added = difference(now, before);
      const removed = difference(before, now);
      if (added.length > 0 || removed.length > 0) {
        reasons.push(
          `The packages they resolve to changed: ${added.length} in (${some(added) || 'none'}), ${removed.length} out (${some(removed) || 'none'})`
        );
      }
    }
  }

  const named = paths.join(', ');
  if (reasons.length === 0) {
    io.write(`No change since ${base} reaches ${named}\naffected=false\n`);
    return 0;
  }
  io.write(`${reasons.join('\n')}\nSo the changes since ${base} reach ${named}\naffected=true\n`);
  return 0;
}
