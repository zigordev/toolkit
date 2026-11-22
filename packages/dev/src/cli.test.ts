import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { type Sandbox, sandbox } from '../test/sandbox.ts';
import { main } from './cli.ts';

let box: Sandbox;
let output = '';

function run(args: readonly string[], files: Record<string, string> = {}): number {
  box = sandbox(files);
  output = '';
  return main(args, {
    cwd: box.root,
    env: { CI: 'true' },
    write: (text) => {
      output += text;
    },
  });
}

afterEach(() => {
  box.remove();
});

describe('the zigordev command', () => {
  it('explains itself when it gets no command', () => {
    expect(run([])).toBe(0);
    expect(output).toContain('Usage: zigordev check [rule...] [file...]');
    expect(output).toContain('comments  no file holds a comment');
  });

  it('explains itself and fails on a command it does not know', () => {
    expect(run(['deploy'])).toBe(2);
    expect(output).toContain('Usage: zigordev check');
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
    expect(output).toContain('(actions, comments, docs, identity, links, scripts)');
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
