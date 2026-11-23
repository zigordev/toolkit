import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Manifest {
  readonly name: string;
  readonly dependencies?: Readonly<Record<string, string>>;
}

const root = new URL('../../../', import.meta.url);
const workspace = readFileSync(new URL('pnpm-workspace.yaml', root), 'utf8').split('\n');

function entries(header: string, indent: string): Map<string, string> {
  const found = new Map<string, string>();
  const start = workspace.indexOf(header);
  if (start === -1) {
    return found;
  }
  for (const line of workspace.slice(start + 1)) {
    if (line === '') {
      continue;
    }
    const match = new RegExp(`^${indent}"?([^":\\s]+)"?: (\\S+)$`).exec(line);
    if (match === null) {
      break;
    }
    found.set(match[1] ?? '', match[2] ?? '');
  }
  return found;
}

function shippedCatalog(): Map<string, string> {
  const start = workspace.indexOf('catalogs:');
  const nested = workspace.indexOf('  shipped:', start);
  return start === -1 || nested === -1 ? new Map() : entries(workspace[nested] ?? '', '    ');
}

const defaults = entries('catalog:', '  ');
const shipped = shippedCatalog();

const packages: Manifest[] = readdirSync(new URL('packages/', root), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map(
    (entry) =>
      JSON.parse(
        readFileSync(new URL(`packages/${entry.name}/package.json`, root), 'utf8')
      ) as Manifest
  );

const runtime = packages.flatMap((manifest) =>
  Object.entries(manifest.dependencies ?? {}).map(([name, spec]) => ({
    owner: manifest.name,
    name,
    spec,
  }))
);

describe('the catalogs of the workspace', () => {
  it('are read from the file, both of them', () => {
    expect(defaults.get('vitest')).toMatch(/^\d+\.\d+\.\d+$/);
    expect(shipped.get('pino')).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('take every dependency that a package under packages/ ships from the catalog named shipped', () => {
    const elsewhere = runtime
      .filter(({ spec }) => spec !== 'catalog:shipped' && !spec.startsWith('workspace:'))
      .map(({ owner, name, spec }) => `${owner} takes ${name} as "${spec}"`);

    expect(elsewhere).toEqual([]);
  });

  it('hold in that catalog nothing that no package ships', () => {
    const shippedByOne = new Set(runtime.map(({ name }) => name));
    const idle = [...shipped.keys()].filter((name) => !shippedByOne.has(name));

    expect(idle).toEqual([]);
  });

  it('keep each version in one catalog only', () => {
    const twice = [...shipped.keys()].filter((name) => defaults.has(name));

    expect(twice).toEqual([]);
  });
});
