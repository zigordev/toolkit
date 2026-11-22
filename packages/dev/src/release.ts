import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface Outcome {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type Run = (command: string, args: readonly string[], cwd: string) => Outcome;

export interface Package {
  readonly name: string;
  readonly path: string;
}

export interface Plan {
  readonly packages: readonly Package[];
  readonly version: string | undefined;
  readonly missing: readonly Package[];
}

interface Listed {
  readonly name?: string;
  readonly path: string;
  readonly private?: boolean;
}

interface Packed {
  readonly filename: string;
}

const versionShape = /^\d+\.\d+\.\d+$/;
const pause = 15;

function output(run: Run, command: string, args: readonly string[], cwd: string): string {
  const outcome = run(command, args, cwd);
  if (outcome.status !== 0) {
    const reason = outcome.stderr.trim() || `it ended with code ${outcome.status}`;
    throw new Error(`"${command} ${args.join(' ')}" failed: ${reason}`);
  }
  return outcome.stdout.trim();
}

export function publicPackages(root: string, run: Run): Package[] {
  const listed = JSON.parse(
    output(run, 'pnpm', ['ls', '-r', '--depth', '-1', '--json'], root)
  ) as readonly Listed[];
  const packages: Package[] = [];
  for (const entry of listed) {
    if (
      entry.name !== undefined &&
      entry.private !== true &&
      resolve(entry.path) !== resolve(root)
    ) {
      packages.push({ name: entry.name, path: entry.path });
    }
  }
  return packages.sort((left, right) => left.name.localeCompare(right.name));
}

export function latestVersion(root: string, run: Run): string | undefined {
  const outcome = run('git', ['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*'], root);
  const version = outcome.stdout.trim().replace(/^v/, '');
  return outcome.status === 0 && versionShape.test(version) ? version : undefined;
}

export function isPublished(pkg: Package, version: string, root: string, run: Run): boolean {
  const outcome = run('npm', ['view', `${pkg.name}@${version}`, 'version'], root);
  if (outcome.status === 0) {
    return outcome.stdout.trim() === version;
  }
  if (outcome.stderr.includes('E404')) {
    return false;
  }
  const reason = outcome.stderr.trim() || `npm ended with code ${outcome.status}`;
  throw new Error(`the registry could not say whether ${pkg.name}@${version} exists: ${reason}`);
}

function missingAt(
  packages: readonly Package[],
  version: string,
  root: string,
  run: Run
): Package[] {
  return packages.filter((pkg) => !isPublished(pkg, version, root, run));
}

export function plan(root: string, run: Run, settle = 0): Plan {
  const packages = publicPackages(root, run);
  const version = packages.length === 0 ? undefined : latestVersion(root, run);
  if (version === undefined) {
    return { packages, version, missing: [] };
  }
  let missing = missingAt(packages, version, root, run);
  for (let waited = 0; missing.length > 0 && waited < settle; waited += pause) {
    run('sleep', [String(pause)], root);
    missing = missingAt(missing, version, root, run);
  }
  return { packages, version, missing };
}

function setVersion(pkg: Package, version: string): void {
  const file = join(pkg.path, 'package.json');
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  writeFileSync(file, `${JSON.stringify({ ...manifest, version }, null, 2)}\n`);
}

export function pack(root: string, folder: string, version: string, run: Run): string[] {
  if (!versionShape.test(version)) {
    throw new Error(`"${version}" is not a version of three numbers, such as 1.4.0`);
  }
  const packages = publicPackages(root, run);
  const missing = missingAt(packages, version, root, run);
  if (missing.length === 0) {
    return [];
  }
  for (const pkg of packages) {
    setVersion(pkg, version);
  }
  const target = resolve(root, folder);
  mkdirSync(target, { recursive: true });
  return missing.map((pkg) => {
    const packed = JSON.parse(
      output(run, 'pnpm', ['pack', '--pack-destination', target, '--json'], pkg.path)
    ) as Packed;
    return packed.filename;
  });
}
