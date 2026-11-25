import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readlinkSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { idle } from '../test/idle.ts';
import { repo, type Sandbox, sandbox } from '../test/sandbox.ts';
import { main } from './cli.ts';

let box: Sandbox;
let output = '';

function run(
  args: readonly string[],
  files: Record<string, string> = {},
  shared = 'node_modules/shared',
  prepare: (root: string) => void = () => {}
): number {
  box = sandbox(files);
  prepare(box.root);
  output = '';
  return main(args, {
    cwd: box.root,
    env: { CI: 'true' },
    shared: join(box.root, shared),
    run: () => ({ status: 1, stdout: '', stderr: 'no command runs in this test' }),
    interact: () => 1,
    atTerminal: false,
    write: (text) => {
      output += text;
    },
    ...idle,
  });
}

afterEach(() => {
  box.remove();
});

describe('a rule that only warns', () => {
  it('prints its warning, and the check still passes', () => {
    box = sandbox({ 'drizzle/0000_create.sql': 'CREATE TABLE "a" ("id" uuid);\n' });
    repo(box);
    box.git('add', '.');
    box.commit('feat: create a');
    box.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    box.write('drizzle/0001_drop.sql', 'DROP TABLE "a";\n');
    output = '';

    const code = main(['check', 'migrations'], {
      cwd: box.root,
      env: { CI: 'true' },
      shared: join(box.root, 'node_modules/shared'),
      run: () => ({ status: 1, stdout: '', stderr: 'no command runs in this test' }),
      interact: () => 1,
      atTerminal: false,
      write: (text) => {
        output += text;
      },
      ...idle,
    });

    expect(code).toBe(0);
    expect(output).toBe(
      [
        'drizzle/0001_drop.sql:1  migrations  warning: DROP TABLE deletes data: the pull request waits for the owner, who adds the label destructive-migration',
        'zigordev check: no findings (migrations)',
        '',
      ].join('\n')
    );
  });
});

describe('the zigordev command', () => {
  it('explains itself when it gets no command', () => {
    expect(run([])).toBe(0);
    expect(output).toContain('Usage: zigordev check [rule...] [file...]');
    expect(output).toContain('       zigordev sync');
    expect(output).toContain('  comments     no file holds a comment');
  });

  it('explains itself and fails on a command it does not know', () => {
    expect(run(['deploy'])).toBe(2);
    expect(output).toContain('Usage: zigordev check');
  });

  it('holds the product of the folder to the contract, through Docker', () => {
    expect(run(['contract'])).toBe(1);
    expect(output).toBe(
      'zigordev contract: compose.yaml cannot be read in this folder:\nno command runs in this test\n'
    );
  });

  it('explains itself when the contract command gets an argument', () => {
    expect(run(['contract', 'gpool'])).toBe(2);
    expect(output).toContain('       zigordev contract\n');
    expect(output).toContain(
      'contract       Starts the product of this folder from its built images'
    );
  });

  it('passes and names the rules it ran', () => {
    expect(run(['check', 'comments', 'links'], { 'README.md': '# Repo\n' })).toBe(0);
    expect(output).toBe('zigordev check: no findings (comments, links)\n');
  });

  it('prints every finding in order and fails', () => {
    const code = run(['check', 'comments', 'links'], {
      'b.ts': 'const b = 1;\n\n// second\n// third\n',
      'a.md': '[gone](gone.md)\n',
    });
    expect(code).toBe(1);
    expect(output).toBe(
      [
        'a.md:1  links  the link to "gone.md" leads nowhere',
        'b.ts:3  comments  a comment: "second"',
        'b.ts:4  comments  a comment: "third"',
        'zigordev check: 3 findings (comments, links)',
        '',
      ].join('\n')
    );
  });

  it('runs every rule when none is named', () => {
    expect(run(['check'], { 'a.ts': '// one\n' })).toBe(1);
    expect(output).toContain('a.ts:1  comments  a comment: "one"');
    expect(output).toContain('README.md  docs  the file is missing');
    expect(output).toContain('package.json  scripts  the file is missing');
    expect(output).toContain('shared  the package holds no shared files');
    expect(output).toContain(
      '(actions, attribution, comments, docs, flags, identity, links, migrations, scripts, shared)'
    );
  });

  it('reads only the files it is given', () => {
    const code = run(['check', 'comments', 'a.ts'], { 'a.ts': '// one\n', 'b.ts': '// two\n' });
    expect(code).toBe(1);
    expect(output).toBe(
      'a.ts:1  comments  a comment: "one"\nzigordev check: 1 finding (comments)\n'
    );
  });

  it('fails on an argument that is neither a rule nor a file', () => {
    expect(run(['check', 'comments', 'missing.ts'])).toBe(2);
    expect(output).toContain('"missing.ts" is neither a rule nor a file');
  });

  it('skips a link to a folder among the files it is given, as the commit hook passes one', () => {
    const files = { 'a.ts': '// one\n', 'folder/b.md': 'b\n' };
    const link = (root: string) => symlinkSync('folder', join(root, 'linked'));
    expect(run(['check', 'comments', 'a.ts', 'linked'], files, undefined, link)).toBe(1);
    expect(output).toBe(
      'a.ts:1  comments  a comment: "one"\nzigordev check: 1 finding (comments)\n'
    );
    box.remove();
    expect(run(['check', 'comments', 'linked'], files, undefined, link)).toBe(0);
    expect(output).toBe('zigordev check: no findings (comments)\n');
  });

  it('links the shared rules to the installed package and says so', () => {
    const store = 'node_modules/.pnpm/d/node_modules/@zigordev/dev';
    const install = (root: string) => {
      mkdirSync(join(root, 'node_modules/@zigordev'), { recursive: true });
      symlinkSync(
        '../.pnpm/d/node_modules/@zigordev/dev',
        join(root, 'node_modules/@zigordev/dev')
      );
    };
    const files = { [`${store}/shared/.claude/rules/core.md`]: 'core' };
    expect(run(['sync'], files, `${store}/shared`, install)).toBe(0);
    expect(output).toBe('updated  .claude/rules\nzigordev sync: 1 file updated\n');
    expect(readlinkSync(join(box.root, '.claude/rules'))).toBe(
      '../node_modules/@zigordev/dev/shared/.claude/rules'
    );
    box.remove();
    const own = { ...files, '.claude/rules/mine.md': 'mine' };
    expect(run(['sync'], own, `${store}/shared`, install)).toBe(1);
    expect(output).toBe(
      'zigordev sync: .claude/rules holds files that are not shared: .claude/rules/mine.md. Move them out of it, then run "zigordev sync" again\n'
    );
  });

  it('copies the shared files and says which ones changed', () => {
    const files = {
      'node_modules/shared/a.yml': 'new',
      'node_modules/shared/b.yml': 'b',
      'a.yml': 'old',
    };
    expect(run(['sync'], files)).toBe(0);
    expect(output).toBe('updated  a.yml\nupdated  b.yml\nzigordev sync: 2 files updated\n');
    expect(readFileSync(join(box.root, 'a.yml'), 'utf8')).toBe('new');
  });

  it('says so when one shared file changed and when none did', () => {
    expect(run(['sync'], { 'node_modules/shared/a.yml': 'a' })).toBe(0);
    expect(output).toBe('updated  a.yml\nzigordev sync: 1 file updated\n');
    box.remove();
    expect(run(['sync'], { 'node_modules/shared/a.yml': 'a', 'a.yml': 'a' })).toBe(0);
    expect(output).toBe('zigordev sync: every shared file is up to date\n');
  });

  it('fails to sync when the package holds no shared files', () => {
    expect(run(['sync'])).toBe(1);
    expect(output).toContain('zigordev sync: the package holds no shared files in');
  });

  it('explains itself when sync gets an argument', () => {
    expect(run(['sync', 'now'], { 'node_modules/shared/a.yml': 'a' })).toBe(2);
    expect(output).toContain('Usage: zigordev check');
  });

  it('starts from its launcher', () => {
    box = sandbox({ 'a.ts': '// one\n' });
    const launcher = fileURLToPath(new URL('../bin/zigordev.js', import.meta.url));
    const result = spawnSync(process.execPath, [launcher, 'check', 'comments'], {
      cwd: box.root,
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('a.ts:1  comments  a comment: "one"');
  });
});
