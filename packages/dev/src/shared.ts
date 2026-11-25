import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';

export type Difference = 'missing' | 'different';

export type LinkDifference = 'missing' | 'copied' | 'elsewhere';

export const linkedFolders: readonly string[] = ['.claude/rules', '.claude/skills'];

function list(folder: string, prefix: string): string[] {
  return readdirSync(join(folder, prefix), { withFileTypes: true })
    .flatMap((entry) => {
      const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      return entry.isDirectory() ? list(folder, path) : [path];
    })
    .sort();
}

function isLinked(path: string): boolean {
  return linkedFolders.some((folder) => path.startsWith(`${folder}/`));
}

export function sharedFiles(source: string): string[] {
  return existsSync(source) ? list(source, '') : [];
}

export function copiedFiles(source: string): string[] {
  return sharedFiles(source).filter((path) => !isLinked(path));
}

export function sharedFolders(source: string): string[] {
  return linkedFolders.filter((folder) => existsSync(join(source, folder)));
}

function sharedRoot(root: string, source: string): string {
  const real = realpathSync(source);
  const inside = relative(realpathSync(root), real);
  const parts = inside.split(sep);
  if (
    inside !== '' &&
    !isAbsolute(inside) &&
    parts[0] !== '..' &&
    !parts.includes('node_modules')
  ) {
    return join(root, inside);
  }
  const installed = join(root, 'node_modules', '@zigordev', 'dev', 'shared');
  if (existsSync(installed) && realpathSync(installed) === real) {
    return installed;
  }
  throw new Error(
    `the shared files in ${source} are neither part of this repo nor its installed @zigordev/dev`
  );
}

export function linkTarget(root: string, source: string, folder: string): string {
  return relative(dirname(join(root, folder)), join(sharedRoot(root, source), folder));
}

export function compare(root: string, source: string, path: string): Difference | undefined {
  const copy = join(root, path);
  if (!existsSync(copy)) {
    return 'missing';
  }
  return readFileSync(copy).equals(readFileSync(join(source, path))) ? undefined : 'different';
}

export function compareLink(
  root: string,
  source: string,
  folder: string
): LinkDifference | undefined {
  const target = linkTarget(root, source, folder);
  const path = join(root, folder);
  if (!existsSync(path) && !isSymbolicLink(path)) {
    return 'missing';
  }
  if (!isSymbolicLink(path)) {
    return 'copied';
  }
  return readlinkSync(path) === target ? undefined : 'elsewhere';
}

function isSymbolicLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

function notShared(root: string, source: string, folder: string): string[] {
  const shared = new Set(sharedFiles(source));
  if (!lstatSync(join(root, folder)).isDirectory()) {
    return [folder];
  }
  return list(root, folder).filter((path) => !shared.has(path));
}

export function sync(root: string, source: string): string[] {
  const links = sharedFolders(source).map((folder) => ({
    folder,
    difference: compareLink(root, source, folder),
  }));
  for (const { folder, difference } of links) {
    if (difference !== 'copied') {
      continue;
    }
    const own = notShared(root, source, folder);
    if (own.length > 0) {
      throw new Error(
        `${folder} holds files that are not shared: ${own.join(', ')}. Move them out of it, then run "zigordev sync" again`
      );
    }
  }
  const written: string[] = [];
  for (const { folder, difference } of links) {
    if (difference === undefined) {
      continue;
    }
    const path = join(root, folder);
    if (difference === 'copied') {
      rmSync(path, { recursive: true });
    } else if (difference === 'elsewhere') {
      unlinkSync(path);
    }
    mkdirSync(dirname(path), { recursive: true });
    symlinkSync(linkTarget(root, source, folder), path);
    written.push(folder);
  }
  for (const path of copiedFiles(source)) {
    if (compare(root, source, path) === undefined) {
      continue;
    }
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), readFileSync(join(source, path)));
    written.push(path);
  }
  return written;
}
