import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type Sandbox, sandbox } from '../test/sandbox.ts';
import { main } from './cli.ts';
import {
  isPublished,
  latestVersion,
  type Outcome,
  pack,
  plan,
  publicPackages,
  type Run,
} from './release.ts';

interface World {
  readonly tag?: string;
  readonly published?: readonly string[];
  readonly registry?: string;
  readonly hidden?: readonly string[];
  readonly listing?: string;
}

let box: Sandbox;
let calls: string[] = [];
let output = '';

function ok(stdout: string): Outcome {
  return { status: 0, stdout, stderr: '' };
}

function failed(stderr: string): Outcome {
  return { status: 1, stdout: '', stderr };
}

function start(world: World = {}): Run {
  box = sandbox({
    'package.json': '{ "name": "repo", "private": true }\n',
    'packages/api/package.json':
      '{\n  "name": "@zigordev/api",\n  "version": "0.0.0",\n  "license": "UNLICENSED"\n}\n',
    'packages/dev/package.json': '{\n  "name": "@zigordev/dev",\n  "version": "0.0.0"\n}\n',
  });
  calls = [];
  output = '';
  const entry = (name: string, folder: string) => ({
    name,
    version: '0.0.0',
    path: join(box.root, folder),
    private: world.hidden?.includes(name) ?? false,
  });
  return (command, args, cwd) => {
    calls.push(`${command} ${args.join(' ')}`);
    if (command === 'pnpm' && args[0] === 'ls') {
      if (world.listing !== undefined) {
        return failed(world.listing);
      }
      return ok(
        JSON.stringify([
          { name: 'repo', path: box.root, private: true },
          entry('@zigordev/dev', 'packages/dev'),
          entry('@zigordev/api', 'packages/api'),
        ])
      );
    }
    if (command === 'git') {
      return world.tag === undefined
        ? failed('fatal: No names found, cannot describe anything.')
        : ok(`${world.tag}\n`);
    }
    if (command === 'npm') {
      if (world.registry !== undefined) {
        return failed(world.registry);
      }
      const wanted = args[1] ?? '';
      return world.published?.includes(wanted) === true
        ? ok(`${wanted.slice(wanted.lastIndexOf('@') + 1)}\n`)
        : failed('npm error code E404\nnpm error 404 Not Found');
    }
    if (command === 'pnpm' && args[0] === 'pack') {
      const manifest = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')) as {
        name: string;
        version: string;
      };
      const name = manifest.name.replace('@', '').replace('/', '-');
      return ok(JSON.stringify({ filename: `${name}-${manifest.version}.tgz` }));
    }
    return failed(`this test knows no "${command}"`);
  };
}

function command(args: readonly string[], run: Run, env: Record<string, string> = {}): number {
  return main(args, {
    cwd: box.root,
    env,
    shared: join(box.root, 'shared'),
    run,
    write: (text) => {
      output += text;
    },
  });
}

function manifest(folder: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(box.root, folder, 'package.json'), 'utf8')) as Record<
    string,
    unknown
  >;
}

afterEach(() => {
  box.remove();
});

describe('the public packages', () => {
  it('are the packages that are not private, by name, without the repo itself', () => {
    const run = start();
    expect(publicPackages(box.root, run).map((pkg) => pkg.name)).toEqual([
      '@zigordev/api',
      '@zigordev/dev',
    ]);
  });

  it('leave a private package out', () => {
    const run = start({ hidden: ['@zigordev/dev'] });
    expect(publicPackages(box.root, run).map((pkg) => pkg.name)).toEqual(['@zigordev/api']);
  });

  it('cannot be listed when pnpm fails, and the error says why', () => {
    const run = start({ listing: 'no workspace here' });
    expect(() => publicPackages(box.root, run)).toThrow(
      '"pnpm ls -r --depth -1 --json" failed: no workspace here'
    );
  });
});

describe('the latest version', () => {
  it('is the newest tag without its v', () => {
    const run = start({ tag: 'v1.4.0' });
    expect(latestVersion(box.root, run)).toBe('1.4.0');
  });

  it('is nothing when no tag exists', () => {
    const run = start();
    expect(latestVersion(box.root, run)).toBeUndefined();
  });

  it('is nothing when the tag is not a version of three numbers', () => {
    const run = start({ tag: 'v2' });
    expect(latestVersion(box.root, run)).toBeUndefined();
  });
});

describe('the registry', () => {
  const dev = { name: '@zigordev/dev', path: '.' };

  it('has a version when npm prints it', () => {
    const run = start({ published: ['@zigordev/dev@1.4.0'] });
    expect(isPublished(dev, '1.4.0', box.root, run)).toBe(true);
  });

  it('does not have a version when npm answers not found', () => {
    const run = start();
    expect(isPublished(dev, '1.4.0', box.root, run)).toBe(false);
  });

  it('stops the release on any other error, so that nothing is published by mistake', () => {
    const run = start({ registry: 'npm error code ECONNRESET' });
    expect(() => isPublished(dev, '1.4.0', box.root, run)).toThrow(
      'the registry could not say whether @zigordev/dev@1.4.0 exists: npm error code ECONNRESET'
    );
  });
});

describe('the plan', () => {
  it('names the packages that are missing at the latest version', () => {
    const run = start({ tag: 'v1.4.0', published: ['@zigordev/api@1.4.0'] });
    const { version, missing } = plan(box.root, run);
    expect(version).toBe('1.4.0');
    expect(missing.map((pkg) => pkg.name)).toEqual(['@zigordev/dev']);
  });

  it('misses nothing while no version is tagged, and does not ask the registry', () => {
    const run = start();
    expect(plan(box.root, run).missing).toEqual([]);
    expect(calls.some((call) => call.startsWith('npm'))).toBe(false);
  });

  it('does not look for a version while no package is public', () => {
    const run = start({ tag: 'v1.4.0', hidden: ['@zigordev/api', '@zigordev/dev'] });
    expect(plan(box.root, run)).toEqual({ packages: [], version: undefined, missing: [] });
    expect(calls).toEqual(['pnpm ls -r --depth -1 --json']);
  });
});

describe('packing', () => {
  it('sets the version in every public package and packs only the missing ones', () => {
    const run = start({ published: ['@zigordev/api@1.4.0'] });
    expect(pack(box.root, 'out', '1.4.0', run)).toEqual(['zigordev-dev-1.4.0.tgz']);
    expect(manifest('packages/dev').version).toBe('1.4.0');
    expect(manifest('packages/api').version).toBe('1.4.0');
    expect(existsSync(join(box.root, 'out'))).toBe(true);
    expect(calls.filter((call) => call.startsWith('pnpm pack'))).toEqual([
      `pnpm pack --pack-destination ${join(box.root, 'out')} --json`,
    ]);
  });

  it('keeps every other field of a manifest', () => {
    const run = start();
    pack(box.root, 'out', '1.4.0', run);
    expect(manifest('packages/api')).toEqual({
      name: '@zigordev/api',
      version: '1.4.0',
      license: 'UNLICENSED',
    });
  });

  it('packs nothing and changes nothing when every package is on npm', () => {
    const run = start({ published: ['@zigordev/api@1.4.0', '@zigordev/dev@1.4.0'] });
    expect(pack(box.root, 'out', '1.4.0', run)).toEqual([]);
    expect(manifest('packages/dev').version).toBe('0.0.0');
    expect(existsSync(join(box.root, 'out'))).toBe(false);
  });

  it('refuses a version that is not three numbers', () => {
    const run = start();
    expect(() => pack(box.root, 'out', 'v1.4', run)).toThrow(
      '"v1.4" is not a version of three numbers, such as 1.4.0'
    );
  });
});

describe('the release command', () => {
  it('plans: it names what is missing and tells the pipeline', () => {
    const run = start({ tag: 'v1.4.0', published: ['@zigordev/api@1.4.0'] });
    box.write('outputs', '');
    expect(command(['release', 'plan'], run, { GITHUB_OUTPUT: join(box.root, 'outputs') })).toBe(0);
    expect(output).toBe(
      'missing  @zigordev/dev@1.4.0\nzigordev release: 1 package to publish at 1.4.0\n'
    );
    expect(readFileSync(join(box.root, 'outputs'), 'utf8')).toBe(
      'public=2\nversion=1.4.0\npublish=true\n'
    );
  });

  it('plans: it says when no package is public', () => {
    const run = start({ hidden: ['@zigordev/api', '@zigordev/dev'] });
    box.write('outputs', '');
    expect(command(['release', 'plan'], run, { GITHUB_OUTPUT: join(box.root, 'outputs') })).toBe(0);
    expect(output).toBe('zigordev release: no package is public, so nothing is released\n');
    expect(readFileSync(join(box.root, 'outputs'), 'utf8')).toBe(
      'public=0\nversion=\npublish=false\n'
    );
  });

  it('plans: it says when no version is tagged yet', () => {
    const run = start();
    expect(command(['release', 'plan'], run)).toBe(0);
    expect(output).toBe('zigordev release: 2 public packages, and no version is tagged yet\n');
  });

  it('plans: it says when every package is on npm', () => {
    const run = start({
      tag: 'v1.4.0',
      published: ['@zigordev/api@1.4.0', '@zigordev/dev@1.4.0'],
    });
    expect(command(['release', 'plan'], run)).toBe(0);
    expect(output).toBe('zigordev release: every public package is on npm at 1.4.0\n');
  });

  it('packs: it names each tarball', () => {
    const run = start();
    expect(command(['release', 'pack', 'out', '1.4.0'], run)).toBe(0);
    expect(output).toBe(
      [
        'packed  zigordev-api-1.4.0.tgz',
        'packed  zigordev-dev-1.4.0.tgz',
        'zigordev release: 2 packages packed into out',
        '',
      ].join('\n')
    );
  });

  it('packs: it says when nothing was left to pack', () => {
    const run = start({ published: ['@zigordev/api@1.4.0', '@zigordev/dev@1.4.0'] });
    expect(command(['release', 'pack', 'out', '1.4.0'], run)).toBe(0);
    expect(output).toBe(
      'zigordev release: every public package is on npm at 1.4.0, so nothing was packed\n'
    );
  });

  it('fails and says why when the registry cannot be asked', () => {
    const run = start({ tag: 'v1.4.0', registry: 'npm error code ECONNRESET' });
    expect(command(['release', 'plan'], run)).toBe(1);
    expect(output).toContain('zigordev release: the registry could not say whether');
  });

  it('explains itself when the arguments are not a plan or a pack', () => {
    const run = start();
    expect(command(['release'], run)).toBe(2);
    expect(command(['release', 'pack', 'out'], run)).toBe(2);
    expect(command(['release', 'plan', 'now'], run)).toBe(2);
    expect(output).toContain('       zigordev release pack <folder> <version>');
  });
});
