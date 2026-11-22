import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type Sandbox, sandbox } from '../test/sandbox.ts';
import { shared } from './rules/shared.ts';
import { sharedFiles, sync } from './shared.ts';

let box: Sandbox;

function start(files: Record<string, string>): { root: string; source: string } {
  box = sandbox(files);
  return { root: join(box.root, 'repo'), source: join(box.root, 'source') };
}

function findings(root: string, source: string): string[] {
  return shared(source)
    .run({ root, files: [], env: {} })
    .map((finding) => `${finding.path}: ${finding.message}`);
}

afterEach(() => {
  box.remove();
});

describe('the shared files', () => {
  it('lists every file of the source, in folders too', () => {
    const { source } = start({ 'source/b.yml': 'b', 'source/.a.json': 'a', 'source/x/c.md': 'c' });
    expect(sharedFiles(source)).toEqual(['.a.json', 'b.yml', 'x/c.md']);
  });

  it('lists nothing when the source does not exist', () => {
    const { source } = start({});
    expect(sharedFiles(source)).toEqual([]);
  });

  it('copies what is missing or different and leaves the rest', () => {
    const { root, source } = start({
      'source/same.yml': 'same',
      'source/changed.yml': 'new',
      'source/x/added.md': 'added',
      'repo/same.yml': 'same',
      'repo/changed.yml': 'old',
      'repo/own.txt': 'own',
    });
    expect(sync(root, source)).toEqual(['changed.yml', 'x/added.md']);
    expect(readFileSync(join(root, 'changed.yml'), 'utf8')).toBe('new');
    expect(readFileSync(join(root, 'x/added.md'), 'utf8')).toBe('added');
    expect(readFileSync(join(root, 'own.txt'), 'utf8')).toBe('own');
    expect(sync(root, source)).toEqual([]);
  });
});

describe('the shared rule', () => {
  it('passes when every shared file matches', () => {
    const { root, source } = start({ 'source/a.yml': 'a', 'repo/a.yml': 'a' });
    expect(findings(root, source)).toEqual([]);
  });

  it('reports a shared file that is missing and one that differs', () => {
    const { root, source } = start({
      'source/a.yml': 'a',
      'source/b.yml': 'b',
      'repo/b.yml': 'changed',
    });
    expect(findings(root, source)).toEqual([
      'a.yml: the shared file is missing, so run "zigordev sync"',
      'b.yml: the file differs from the shared one, so run "zigordev sync"',
    ]);
  });

  it('reports a package that holds no shared files', () => {
    const { root, source } = start({ 'repo/a.yml': 'a' });
    expect(findings(root, source)).toEqual([`${source}: the package holds no shared files`]);
  });
});
