import { afterEach, describe, expect, it } from 'vitest';
import { repo, type Sandbox, sandbox } from '../test/sandbox.ts';
import { git, repoFiles } from './files.ts';

let box: Sandbox;

afterEach(() => {
  box.remove();
});

describe('the list of files in a repo', () => {
  it('walks a folder that is not a git repo and skips what is never ours', () => {
    box = sandbox({
      'a.ts': '',
      'src/b.ts': '',
      'node_modules/x/index.js': '',
      'dist/a.js': '',
      'coverage/index.html': '',
    });
    expect(repoFiles(box.root)).toEqual(['a.ts', 'src/b.ts']);
  });

  it('asks git in a repo, so ignored files stay out and new files are in', () => {
    box = sandbox({ '.gitignore': 'ignored.ts\n', 'a.ts': '', 'ignored.ts': '', 'gone.ts': '' });
    repo(box);
    box.git('add', 'a.ts', 'gone.ts');
    box.write('new.ts', '');
    box.git('rm', '-q', '--cached', 'a.ts');
    box.git('add', 'a.ts');
    expect(repoFiles(box.root)).toEqual(['.gitignore', 'a.ts', 'gone.ts', 'new.ts']);
  });

  it('answers nothing when git fails', () => {
    box = sandbox();
    expect(git(box.root, ['rev-parse', 'HEAD'])).toBeUndefined();
  });
});
