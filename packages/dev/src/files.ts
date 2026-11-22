import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const skipped = new Set(['.git', 'node_modules', 'dist', 'coverage']);

export function git(root: string, args: readonly string[]): string | undefined {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trimEnd();
  } catch {
    return undefined;
  }
}

function walk(root: string, folder: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(root, folder), { withFileTypes: true })) {
    if (skipped.has(entry.name)) {
      continue;
    }
    const path = folder === '' ? entry.name : `${folder}/${entry.name}`;
    if (entry.isDirectory()) {
      found.push(...walk(root, path));
    } else if (entry.isFile()) {
      found.push(path);
    }
  }
  return found;
}

export function repoFiles(root: string): string[] {
  const listed = git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
  const files =
    listed === undefined ? walk(root, '') : listed.split('\0').filter((path) => path !== '');
  return files.filter((path) => existsSync(join(root, path))).sort();
}
