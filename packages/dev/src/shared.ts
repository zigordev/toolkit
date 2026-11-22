import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type Difference = 'missing' | 'different';

function list(folder: string, prefix: string): string[] {
  return readdirSync(join(folder, prefix), { withFileTypes: true })
    .flatMap((entry) => {
      const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      return entry.isDirectory() ? list(folder, path) : [path];
    })
    .sort();
}

export function sharedFiles(source: string): string[] {
  return existsSync(source) ? list(source, '') : [];
}

export function compare(root: string, source: string, path: string): Difference | undefined {
  const copy = join(root, path);
  if (!existsSync(copy)) {
    return 'missing';
  }
  return readFileSync(copy).equals(readFileSync(join(source, path))) ? undefined : 'different';
}

export function sync(root: string, source: string): string[] {
  const written: string[] = [];
  for (const path of sharedFiles(source)) {
    if (compare(root, source, path) === undefined) {
      continue;
    }
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), readFileSync(join(source, path)));
    written.push(path);
  }
  return written;
}
