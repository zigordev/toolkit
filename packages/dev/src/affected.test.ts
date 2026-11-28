import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { idle } from '../test/idle.ts';
import { repo, type Sandbox, sandbox } from '../test/sandbox.ts';
import { importsFromOutside, packagesOf } from './affected.ts';
import { main } from './cli.ts';
import type { Outcome, Run } from './release.ts';

interface Tree {
  readonly version?: string;
  readonly dependencies?: Readonly<Record<string, Tree>>;
}

let box: Sandbox;
let output = '';

const closure = { 'apps/mobile': ['apps/mobile', 'packages/ui-native'] };

function treeWith(expo: string): string {
  const link = { version: 'link:../../packages/ui-native' };
  const core: Tree = { version: '3.0.0' };
  return `${JSON.stringify([
    {
      path: 'apps/mobile',
      dependencies: {
        expo: { version: expo, dependencies: { 'expo-modules-core': core } },
        'expo-router': { version: '58.0.32', dependencies: { 'expo-modules-core': core } },
        '@acme/ui-native': link,
      },
    },
  ])}\n`;
}

const files = {
  'apps/mobile/package.json': '{ "name": "mobile" }\n',
  'apps/mobile/app/index.tsx': [
    "import { check } from '../../web/src/lib/forms';",
    "import texts from '../../web/messages/en.json' with { type: 'json' };",
    "import { Button } from '@acme/ui-native';",
    "import { local } from '../src/local';",
    "const later = () => import('../../web/src/lib/lazy');",
    "import { gone } from '../../web/src/lib/missing';",
    'export { check, texts, Button, local, later, gone };',
    '',
  ].join('\n'),
  'apps/mobile/src/local.ts': 'export const local = 1;\n',
  'apps/web/package.json': '{ "name": "web" }\n',
  'apps/web/src/lib/forms.ts': "export { rule as check } from './rules';\n",
  'apps/web/src/lib/rules.ts': 'export const rule = 1;\n',
  'apps/web/src/lib/lazy.ts': 'export const lazy = 1;\n',
  'apps/web/src/app/page.tsx': 'export default 1;\n',
  'apps/web/messages/en.json': '{ "hello": "Hello" }\n',
  'packages/ui-native/package.json': '{ "name": "@acme/ui-native" }\n',
  'packages/ui-native/src/index.ts': 'export const Button = 1;\n',
  '.github/workflows/check.yml': 'name: Check\n',
  'mise.toml': '[tools]\nnode = "26.13.1"\n',
  'pnpm-lock.yaml': "lockfileVersion: '9.0'\n",
  '.closure.json': `${JSON.stringify(closure)}\n`,
  '.tree.json': treeWith('58.0.26'),
};

function withoutGit(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))
  );
}

function pnpm(args: readonly string[], cwd: string): Outcome {
  const wanted = args
    .filter((arg) => arg.startsWith('{'))
    .map((arg) => arg.replace(/^\{(.*)\}\.\.\.$/, '$1'));
  if (args.includes('--lockfile-only')) {
    const tree = join(cwd, '.tree.json');
    return existsSync(tree)
      ? { status: 0, stdout: readFileSync(tree, 'utf8'), stderr: '' }
      : { status: 1, stdout: '', stderr: 'no lockfile' };
  }
  const known = JSON.parse(readFileSync(join(cwd, '.closure.json'), 'utf8')) as Record<
    string,
    string[]
  >;
  const folders = wanted.flatMap((path) => known[path] ?? []);
  if (folders.length === 0) {
    return { status: 1, stdout: '', stderr: 'No projects matched the filters' };
  }
  return { status: 0, stdout: folders.map((folder) => join(cwd, folder)).join('\n'), stderr: '' };
}

const run: Run = (command, args, cwd) => {
  if (command === 'pnpm') {
    return pnpm(args, cwd);
  }
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env: withoutGit() });
  return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
};

function start(): string {
  box = sandbox(files);
  repo(box);
  box.git('add', '--all');
  box.commit('chore: start');
  output = '';
  return box.git('rev-parse', 'HEAD');
}

function change(changes: Readonly<Record<string, string>>): void {
  for (const [path, content] of Object.entries(changes)) {
    box.write(path, content);
  }
  box.git('add', '--all');
  box.commit('chore: change');
}

function command(args: readonly string[], through: Run = run): number {
  return main(args, {
    cwd: box.root,
    env: {},
    shared: join(box.root, 'shared'),
    run: through,
    interact: () => 1,
    atTerminal: false,
    write: (text) => {
      output += text;
    },
    ...idle,
  });
}

function verdict(): string | undefined {
  return output.trim().split('\n').at(-1);
}

afterEach(() => {
  box.remove();
});

describe('zigordev affected', () => {
  it('says that a change in the folder of the project reaches it', () => {
    const base = start();
    change({ 'apps/mobile/src/local.ts': 'export const local = 2;\n' });

    expect(command(['affected', '--base', base, 'apps/mobile'])).toBe(0);
    expect(output).toContain('Changed in the folders: apps/mobile/src/local.ts\n');
    expect(output).toContain(`So the changes since ${base} reach apps/mobile\n`);
    expect(verdict()).toBe('affected=true');
  });

  it('says that a change in a workspace package the project ships with reaches it', () => {
    const base = start();
    change({ 'packages/ui-native/src/index.ts': 'export const Button = 2;\n' });

    command(['affected', '--base', base, 'apps/mobile']);

    expect(output).toContain('Changed in the folders: packages/ui-native/src/index.ts\n');
    expect(verdict()).toBe('affected=true');
  });

  it('follows the imports that leave the folders, also from the files they lead to, and JSON texts', () => {
    const base = start();
    change({
      'apps/web/src/lib/rules.ts': 'export const rule = 2;\n',
      'apps/web/messages/en.json': '{ "hello": "Hi" }\n',
    });

    command(['affected', '--base', base, 'apps/mobile']);

    expect(output).toContain(
      'Changed, and imported from outside the folders: apps/web/messages/en.json, apps/web/src/lib/rules.ts\n'
    );
    expect(verdict()).toBe('affected=true');
  });

  it('lists every file that the folders import from outside, and leaves out the ones that do not exist', () => {
    start();

    expect(
      importsFromOutside(['apps/mobile', 'packages/ui-native'], {
        cwd: box.root,
        run,
        write: () => undefined,
      })
    ).toEqual([
      'apps/web/messages/en.json',
      'apps/web/src/lib/forms.ts',
      'apps/web/src/lib/lazy.ts',
      'apps/web/src/lib/rules.ts',
    ]);
  });

  it('says that a change elsewhere in another app does not reach the project', () => {
    const base = start();
    change({ 'apps/web/src/app/page.tsx': 'export default 2;\n' });

    command(['affected', '--base', base, 'apps/mobile']);

    expect(output).toBe(`No change since ${base} reaches apps/mobile\naffected=false\n`);
  });

  it('says that a new mise.toml reaches the project, because it pins the tools of the build', () => {
    const base = start();
    change({ 'mise.toml': '[tools]\nnode = "26.14.0"\n' });

    command(['affected', '--base', base, 'apps/mobile']);

    expect(output).toContain('Changed, and pins the tools of every build: mise.toml\n');
    expect(verdict()).toBe('affected=true');
  });

  it('says that a lockfile that moves a package the project resolves to reaches it', () => {
    const base = start();
    change({ 'pnpm-lock.yaml': "lockfileVersion: '9.0'\n#\n", '.tree.json': treeWith('58.0.27') });

    command(['affected', '--base', base, 'apps/mobile']);

    expect(output).toContain(
      'The packages they resolve to changed: 1 in (expo@58.0.27), 1 out (expo@58.0.26)\n'
    );
    expect(verdict()).toBe('affected=true');
    expect(box.git('worktree', 'list').split('\n')).toHaveLength(1);
  });

  it('says that a lockfile that leaves those packages alone does not reach the project', () => {
    const base = start();
    change({ 'pnpm-lock.yaml': "lockfileVersion: '9.0'\n#\n" });

    command(['affected', '--base', base, 'apps/mobile']);

    expect(verdict()).toBe('affected=false');
  });

  it('counts every package once, and a link to a workspace package never', () => {
    start();

    expect(
      [...packagesOf(['apps/mobile'], box.root, run)].sort((left, right) =>
        left.localeCompare(right)
      )
    ).toEqual(['expo-modules-core@3.0.0', 'expo-router@58.0.32', 'expo@58.0.26']);
  });

  it('counts a folder that holds no project, such as a workflow file, as itself', () => {
    const base = start();
    change({ '.github/workflows/check.yml': 'name: Check it\n' });

    command(['affected', '--base', base, 'apps/mobile', '.github/workflows/check.yml']);

    expect(output).toContain('Changed in the folders: .github/workflows/check.yml\n');
    expect(output).toContain(`reach apps/mobile, .github/workflows/check.yml\n`);
    expect(verdict()).toBe('affected=true');
  });

  it('names the first five changed files and counts the rest', () => {
    const base = start();
    change(
      Object.fromEntries(
        [1, 2, 3, 4, 5, 6, 7].map((number) => [`apps/mobile/src/file-${number}.ts`, 'export {};\n'])
      )
    );

    command(['affected', '--base', base, 'apps/mobile']);

    expect(output).toContain('apps/mobile/src/file-5.ts and 2 more\n');
  });

  it('ends with code 1 and the reason when git cannot compare the commits', () => {
    start();

    expect(command(['affected', '--base', 'no-such-commit', 'apps/mobile'])).toBe(1);
    expect(output).toMatch(/^zigordev affected: git cannot compare no-such-commit with HEAD: /);
  });

  it('ends with code 1 when the base cannot be checked out to read its lockfile', () => {
    const base = start();
    change({ 'pnpm-lock.yaml': "lockfileVersion: '9.0'\n#\n" });
    const refusing: Run = (name, args, cwd) =>
      name === 'git' && args[0] === 'worktree'
        ? { status: 128, stdout: '', stderr: 'fatal: no room\n' }
        : run(name, args, cwd);

    expect(command(['affected', '--base', base, 'apps/mobile'], refusing)).toBe(1);
    expect(output).toBe(`zigordev affected: git cannot check out ${base}: fatal: no room\n`);
  });

  it('ends with code 1 when pnpm lists the packages in a form that is not JSON', () => {
    const base = start();
    change({ 'pnpm-lock.yaml': "lockfileVersion: '9.0'\n#\n" });
    const garbled: Run = (name, args, cwd) =>
      name === 'pnpm' && args.includes('--lockfile-only')
        ? { status: 0, stdout: 'WARN something\n', stderr: '' }
        : run(name, args, cwd);

    expect(command(['affected', '--base', base, 'apps/mobile'], garbled)).toBe(1);
    expect(output).toContain('a form that is not JSON\n');
  });

  it('shows the usage and ends with code 2 without a base, without a folder, or with an unknown flag', () => {
    start();

    expect(command(['affected', 'apps/mobile'])).toBe(2);
    expect(command(['affected', '--base', 'HEAD'])).toBe(2);
    expect(command(['affected', '--base', 'HEAD', '--json', 'apps/mobile'])).toBe(2);
    expect(output).toContain('zigordev affected --base <commit> <folder...>');
  });
});
