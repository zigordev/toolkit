import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type Sandbox, sandbox } from '../test/sandbox.ts';
import { main } from './cli.ts';
import { firstPublish, manifest, repository, type Tools } from './first-publish.ts';
import type { Outcome } from './release.ts';

interface World {
  readonly remote?: string;
  readonly npm?: string;
  readonly signedIn?: boolean;
  readonly onNpm?: readonly string[];
  readonly registry?: string;
  readonly failing?: string;
  readonly unattended?: boolean;
}

let box: Sandbox;
let asked: string[] = [];
let done: string[] = [];
let output = '';
let published: Record<string, unknown>[] = [];
let folders: string[] = [];

function ok(stdout: string): Outcome {
  return { status: 0, stdout, stderr: '' };
}

function failed(stderr: string): Outcome {
  return { status: 1, stdout: '', stderr };
}

function start(world: World = {}): Tools {
  box = sandbox();
  asked = [];
  done = [];
  output = '';
  published = [];
  folders = [];
  return {
    run: (command, args) => {
      const call = `${command} ${args.join(' ')}`;
      asked.push(call);
      if (call === 'git remote get-url origin') {
        return world.remote === ''
          ? failed('error: No such remote')
          : ok(`${world.remote ?? 'https://github.com/zigordev/toolkit.git'}\n`);
      }
      if (call.startsWith('pnpm ls')) {
        return ok(
          JSON.stringify([
            { name: 'toolkit', private: true },
            { name: '@zigordev/dev', private: true },
            { name: '@zigordev/config', private: true },
          ])
        );
      }
      if (call === 'npm --version') {
        return ok(`${world.npm ?? '11.20.0'}\n`);
      }
      if (call === 'npm whoami') {
        return world.signedIn === false ? failed('npm error code ENEEDAUTH') : ok('zigordev\n');
      }
      if (command === 'npm' && args[0] === 'view') {
        if (world.registry !== undefined) {
          return failed(world.registry);
        }
        return world.onNpm?.includes(args[1] ?? '') === true
          ? ok(`${args[1]}\n`)
          : failed('npm error code E404');
      }
      return failed(`this test knows no "${call}"`);
    },
    interact: (command, args) => {
      const folder = args[0] === 'publish' ? (args[1] ?? '') : '';
      const whole = `${command} ${args.join(' ')}`;
      const call = folder === '' ? whole : whole.replace(folder, '<folder>');
      done.push(call);
      if (folder !== '') {
        folders.push(folder);
        published.push(
          JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')) as Record<string, unknown>
        );
      }
      return world.failing !== undefined && call.startsWith(world.failing) ? 1 : 0;
    },
    atTerminal: world.unattended !== true,
    write: (text) => {
      output += text;
    },
  };
}

const publish = 'npm publish <folder> --access public';

function tie(name: string): string {
  return `npm trust github ${name} --file ci.yml --repository zigordev/toolkit --environment release --allow-publish --yes`;
}

afterEach(() => {
  box.remove();
});

describe('the repo a package is tied to', () => {
  it('is read from the remote, whether it is written for https or for ssh', () => {
    expect(repository('.', start().run)).toBe('zigordev/toolkit');
    box.remove();
    expect(repository('.', start({ remote: 'git@github.com:zigordev/platform.git' }).run)).toBe(
      'zigordev/platform'
    );
    box.remove();
    expect(
      repository('.', start({ remote: 'https://github.com/zigordev/notifications' }).run)
    ).toBe('zigordev/notifications');
  });

  it('cannot be read when the folder has no remote on github.com', () => {
    expect(() => repository('.', start({ remote: '' }).run)).toThrow(
      'this folder has no remote named origin on github.com'
    );
    box.remove();
    expect(() => repository('.', start({ remote: 'https://example.com/a/b.git' }).run)).toThrow(
      'no remote named origin on github.com'
    );
  });
});

describe('the first version of a package', () => {
  it('is empty, unlicensed, at 0.0.0, and names the repo exactly as npm expects it', () => {
    expect(manifest('@zigordev/dev', 'zigordev/toolkit')).toEqual({
      name: '@zigordev/dev',
      version: '0.0.0',
      description:
        'The first, empty version of this package. The pipeline of zigordev/toolkit publishes every later one.',
      license: 'UNLICENSED',
      repository: { type: 'git', url: 'git+https://github.com/zigordev/toolkit.git' },
    });
  });
});

describe('the first publish', () => {
  it('publishes an empty version of a new name, then ties the name to the repo', () => {
    const tools = start();
    firstPublish(box.root, ['@zigordev/dev'], false, tools);
    expect(done).toEqual([publish, tie('@zigordev/dev')]);
    expect(published).toEqual([manifest('@zigordev/dev', 'zigordev/toolkit')]);
    expect(output).toBe(
      [
        '@zigordev/dev  is new on npm, so an empty 0.0.0 is published first',
        '@zigordev/dev  is tied to zigordev/toolkit, ci.yml and the environment release',
        '',
      ].join('\n')
    );
  });

  it('leaves no folder behind', () => {
    const tools = start();
    firstPublish(box.root, ['@zigordev/dev'], false, tools);
    expect(folders).toHaveLength(1);
    expect(existsSync(folders[0] ?? '')).toBe(false);
  });

  it('only ties a name that is on npm already', () => {
    const tools = start({ onNpm: ['@zigordev/dev'] });
    firstPublish(box.root, ['@zigordev/dev'], false, tools);
    expect(done).toEqual([tie('@zigordev/dev')]);
    expect(output).toContain('@zigordev/dev  is on npm already\n');
  });

  it('takes several names, one after the other', () => {
    const tools = start({ onNpm: ['@zigordev/config'] });
    firstPublish(box.root, ['@zigordev/dev', '@zigordev/config'], false, tools);
    expect(done).toEqual([publish, tie('@zigordev/dev'), tie('@zigordev/config')]);
  });

  it('asks for a sign-in first when npm does not know the user', () => {
    const tools = start({ signedIn: false });
    firstPublish(box.root, ['@zigordev/dev'], false, tools);
    expect(done).toEqual(['npm login', publish, tie('@zigordev/dev')]);
  });

  it('refuses to run without a person at a terminal, before it asks anything', () => {
    const tools = start({ unattended: true });
    expect(() => firstPublish(box.root, ['@zigordev/dev'], false, tools)).toThrow(
      'it needs a person at a terminal'
    );
    expect(asked).toEqual([]);
    expect(done).toEqual([]);
  });

  it('still shows a dry run without a terminal', () => {
    const tools = start({ unattended: true });
    firstPublish(box.root, ['@zigordev/dev'], true, tools);
    expect(output).toContain('@zigordev/dev  would get an empty 0.0.0 on npm');
  });

  it('refuses a name that is not a package of this repo, before anything is run', () => {
    const tools = start();
    expect(() => firstPublish(box.root, ['@zigordev/typo'], false, tools)).toThrow(
      '"@zigordev/typo" is not a package of this repo'
    );
    expect(done).toEqual([]);
  });

  it('refuses an npm that cannot tie a package to a repo yet', () => {
    const tools = start({ npm: '11.14.9' });
    expect(() => firstPublish(box.root, ['@zigordev/dev'], false, tools)).toThrow(
      'npm 11.14.9 is older than 11.15.0'
    );
    expect(done).toEqual([]);
  });

  it('accepts the first npm that can, and every later one', () => {
    for (const npm of ['11.15.0', '11.20.0', '12.0.0']) {
      const tools = start({ npm });
      firstPublish(box.root, ['@zigordev/dev'], true, tools);
      expect(output).toContain('would run: npm trust github');
      box.remove();
    }
    start();
  });

  it('stops when the sign-in does not go through', () => {
    const tools = start({ signedIn: false, failing: 'npm login' });
    expect(() => firstPublish(box.root, ['@zigordev/dev'], false, tools)).toThrow(
      'the sign-in to npm did not go through, so nothing after it was run'
    );
    expect(done).toEqual(['npm login']);
  });

  it('does not tie a name whose first publish failed, and still leaves no folder', () => {
    const tools = start({ failing: 'npm publish' });
    expect(() => firstPublish(box.root, ['@zigordev/dev'], false, tools)).toThrow(
      'the first publish of @zigordev/dev did not go through'
    );
    expect(done).toEqual([publish]);
    expect(existsSync(folders[0] ?? '')).toBe(false);
  });

  it('says so when the tie does not go through', () => {
    const tools = start({ onNpm: ['@zigordev/dev'], failing: 'npm trust' });
    expect(() => firstPublish(box.root, ['@zigordev/dev'], false, tools)).toThrow(
      'the tie between @zigordev/dev and zigordev/toolkit did not go through'
    );
  });

  it('stops when the registry cannot say whether the name exists', () => {
    const tools = start({ registry: 'npm error code ECONNRESET' });
    expect(() => firstPublish(box.root, ['@zigordev/dev'], false, tools)).toThrow(
      'the registry could not say whether @zigordev/dev exists: npm error code ECONNRESET'
    );
    expect(done).toEqual([]);
  });

  it('changes nothing in a dry run, and says what it would do', () => {
    const tools = start({ signedIn: false, onNpm: ['@zigordev/config'] });
    firstPublish(box.root, ['@zigordev/dev', '@zigordev/config'], true, tools);
    expect(done).toEqual([]);
    expect(asked).not.toContain('npm whoami');
    expect(output).toBe(
      [
        '@zigordev/dev  would get an empty 0.0.0 on npm',
        `@zigordev/dev  would run: ${tie('@zigordev/dev')}`,
        '@zigordev/config  is on npm already, so no first version would be published',
        `@zigordev/config  would run: ${tie('@zigordev/config')}`,
        '',
      ].join('\n')
    );
  });
});

describe('the first-publish command', () => {
  function command(args: readonly string[], tools: Tools): number {
    return main(args, {
      cwd: box.root,
      env: {},
      shared: join(box.root, 'shared'),
      run: tools.run,
      interact: tools.interact,
      atTerminal: tools.atTerminal,
      write: tools.write,
    });
  }

  it('ties the packages and reminds of the two days', () => {
    const tools = start();
    expect(command(['first-publish', '@zigordev/dev'], tools)).toBe(0);
    expect(output).toContain(
      'zigordev first-publish: 1 package tied. The pipeline has to publish within 2 days, or the tie expires\n'
    );
  });

  it('says that a dry run changed nothing', () => {
    const tools = start();
    expect(command(['first-publish', '--dry-run', '@zigordev/dev'], tools)).toBe(0);
    expect(output).toContain(
      'zigordev first-publish: this was a dry run, so nothing was changed\n'
    );
    expect(done).toEqual([]);
  });

  it('fails and says why', () => {
    const tools = start();
    expect(command(['first-publish', '@zigordev/typo'], tools)).toBe(1);
    expect(output).toBe('zigordev first-publish: "@zigordev/typo" is not a package of this repo\n');
  });

  it('explains itself when it gets no package, or an option it does not know', () => {
    const tools = start();
    expect(command(['first-publish'], tools)).toBe(2);
    expect(command(['first-publish', '--dry-run'], tools)).toBe(2);
    expect(command(['first-publish', '--force', '@zigordev/dev'], tools)).toBe(2);
    expect(output).toContain('       zigordev first-publish [--dry-run] <package...>');
    expect(done).toEqual([]);
  });
});
