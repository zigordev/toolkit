import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
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

const store = 'repo/node_modules/.pnpm/@zigordev+dev@1.0.0/node_modules/@zigordev/dev';

const linkedShared = {
  '.claude/rules/core.md': 'core',
  '.claude/skills/one/SKILL.md': 'skill',
  '.claude/settings.json': '{}',
  'lefthook.yml': 'hooks',
};

function under(folder: string, files: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(files).map(([path, content]) => [`${folder}/${path}`, content])
  );
}

function product(own: Record<string, string> = {}): { root: string; source: string } {
  box = sandbox({ ...under(`${store}/shared`, linkedShared), ...under('repo', own) });
  const root = join(box.root, 'repo');
  mkdirSync(join(root, 'node_modules/@zigordev'), { recursive: true });
  symlinkSync(
    '../.pnpm/@zigordev+dev@1.0.0/node_modules/@zigordev/dev',
    join(root, 'node_modules/@zigordev/dev')
  );
  return { root, source: join(box.root, store, 'shared') };
}

function toolkit(): { root: string; source: string } {
  box = sandbox(under('repo/packages/dev/shared', linkedShared));
  return { root: join(box.root, 'repo'), source: join(box.root, 'repo/packages/dev/shared') };
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

describe('the shared folders that are links', () => {
  it('links the rules and the skills to the installed package, and copies the other files', () => {
    const { root, source } = product();
    expect(sync(root, source)).toEqual([
      '.claude/rules',
      '.claude/skills',
      '.claude/settings.json',
      'lefthook.yml',
    ]);
    expect(readlinkSync(join(root, '.claude/rules'))).toBe(
      '../node_modules/@zigordev/dev/shared/.claude/rules'
    );
    expect(readlinkSync(join(root, '.claude/skills'))).toBe(
      '../node_modules/@zigordev/dev/shared/.claude/skills'
    );
    expect(readFileSync(join(root, '.claude/rules/core.md'), 'utf8')).toBe('core');
    expect(lstatSync(join(root, '.claude/settings.json')).isSymbolicLink()).toBe(false);
    expect(sync(root, source)).toEqual([]);
  });

  it('links to the source folders in toolkit, where the package is part of the repo', () => {
    const { root, source } = toolkit();
    sync(root, source);
    expect(readlinkSync(join(root, '.claude/rules'))).toBe('../packages/dev/shared/.claude/rules');
    expect(readFileSync(join(root, '.claude/skills/one/SKILL.md'), 'utf8')).toBe('skill');
  });

  it('replaces a folder of old copies with the link', () => {
    const { root, source } = product({
      '.claude/rules/core.md': 'old',
      '.claude/skills/one/SKILL.md': 'old',
    });
    expect(sync(root, source)).toContain('.claude/rules');
    expect(lstatSync(join(root, '.claude/rules')).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(root, '.claude/rules/core.md'), 'utf8')).toBe('core');
  });

  it("refuses to replace a folder that holds a file of the repo's own, and changes nothing", () => {
    const { root, source } = product({
      '.claude/rules/core.md': 'old',
      '.claude/rules/mine.md': 'mine',
    });
    expect(() => sync(root, source)).toThrow(
      '.claude/rules holds files that are not shared: .claude/rules/mine.md'
    );
    expect(readFileSync(join(root, '.claude/rules/mine.md'), 'utf8')).toBe('mine');
    expect(existsSync(join(root, '.claude/skills'))).toBe(false);
  });

  it('points a link that leads elsewhere back at the package', () => {
    const { root, source } = product();
    mkdirSync(join(root, '.claude'), { recursive: true });
    symlinkSync('../elsewhere', join(root, '.claude/rules'));
    expect(sync(root, source)).toContain('.claude/rules');
    expect(readlinkSync(join(root, '.claude/rules'))).toBe(
      '../node_modules/@zigordev/dev/shared/.claude/rules'
    );
  });

  it('passes the rule when the folders are links and every copy matches', () => {
    const { root, source } = product();
    sync(root, source);
    expect(findings(root, source)).toEqual([]);
  });

  it('reports a missing link and a folder of copies', () => {
    const { root, source } = product({
      '.claude/skills/one/SKILL.md': 'skill',
      '.claude/settings.json': '{}',
      'lefthook.yml': 'hooks',
    });
    expect(findings(root, source)).toEqual([
      '.claude/rules: the link to the shared folder is missing, so run "zigordev sync"',
      '.claude/skills: the folder holds copies instead of a link to the shared one, so run "zigordev sync"',
    ]);
  });

  it('reports a link that leads elsewhere', () => {
    const { root, source } = product();
    sync(root, source);
    unlinkSync(join(root, '.claude/rules'));
    symlinkSync('../elsewhere', join(root, '.claude/rules'));
    expect(findings(root, source)).toEqual([
      '.claude/rules: the link leads elsewhere than the shared folder, so run "zigordev sync"',
    ]);
  });

  it('reports shared files that are neither part of the repo nor installed in it', () => {
    box = sandbox(under('source', linkedShared));
    const root = join(box.root, 'repo');
    mkdirSync(root);
    const source = join(box.root, 'source');
    expect(findings(root, source)).toEqual([
      `${source}: the shared files in ${source} are neither part of this repo nor its installed @zigordev/dev`,
    ]);
  });
});
