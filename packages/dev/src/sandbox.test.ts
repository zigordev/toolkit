import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { repo, sandbox } from '../test/sandbox.ts';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the test sandbox', () => {
  it('keeps its git commands in its own repo while a git hook points GIT_DIR at another', () => {
    const outer = sandbox();
    repo(outer);
    outer.commit('chore: the repo a hook runs in');
    const head = outer.git('rev-parse', 'HEAD');
    vi.stubEnv('GIT_DIR', join(outer.root, '.git'));
    vi.stubEnv('GIT_WORK_TREE', outer.root);
    const inner = sandbox({ 'a.ts': 'export const a = 1;\n' });
    try {
      repo(inner);
      inner.git('add', '.');
      inner.commit('feat: the test repo');
      inner.git('switch', '-q', '-c', 'feature');
      inner.git('update-ref', 'refs/remotes/origin/main', 'HEAD');

      expect(inner.git('log', '--format=%s')).toBe('feat: the test repo');
      expect(outer.git('rev-parse', 'HEAD')).toBe(head);
      expect(outer.git('branch', '--show-current')).toBe('main');
      expect(outer.git('config', '--get', 'core.bare')).toBe('false');
      expect(outer.git('for-each-ref', '--format=%(refname)')).toBe('refs/heads/main');
    } finally {
      inner.remove();
      outer.remove();
    }
  });
});

describe('the pre-push hook', () => {
  it('runs the check without the git settings a hook inherits, so tests cannot reach the repo', () => {
    const hooks = readFileSync(new URL('../lefthook.yml', import.meta.url), 'utf8');

    expect(hooks).toContain(
      'run: env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE -u GIT_COMMON_DIR -u GIT_OBJECT_DIRECTORY pnpm run check:quick'
    );
  });
});
