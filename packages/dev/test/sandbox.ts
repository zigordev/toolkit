import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export interface Sandbox {
  readonly root: string;
  write(path: string, content: string): void;
  git(...args: string[]): string;
  commit(message: string, author?: string, committer?: string): void;
  remove(): void;
}

export const owner = 'zigordev <zigordev@gmail.com>';

function identityOf(who: string): { name: string; email: string } {
  const match = /^(.*) <(.*)>$/.exec(who);
  return { name: match?.[1] ?? '', email: match?.[2] ?? '' };
}

export function sandbox(files: Readonly<Record<string, string>> = {}): Sandbox {
  const root = mkdtempSync(join(tmpdir(), 'zigordev-'));
  const box: Sandbox = {
    root,
    write(path, content) {
      const target = join(root, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    },
    git(...args) {
      return execFileSync('git', args, {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    },
    commit(message, author = owner, committer = author) {
      const by = identityOf(author);
      const through = identityOf(committer);
      execFileSync('git', ['commit', '-q', '--allow-empty', '-m', message], {
        cwd: root,
        stdio: 'ignore',
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: by.name,
          GIT_AUTHOR_EMAIL: by.email,
          GIT_COMMITTER_NAME: through.name,
          GIT_COMMITTER_EMAIL: through.email,
        },
      });
    },
    remove() {
      rmSync(root, { recursive: true, force: true });
    },
  };
  for (const [path, content] of Object.entries(files)) {
    box.write(path, content);
  }
  return box;
}

export function repo(box: Sandbox, who: string = owner): void {
  const { name, email } = identityOf(who);
  box.git('init', '-q', '-b', 'main');
  box.git('config', 'user.name', name);
  box.git('config', 'user.email', email);
  box.git('config', 'commit.gpgsign', 'false');
}
