import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attribution as commitAttribution } from './commitlint.js';
import {
  attribution,
  decide,
  owner,
  parse,
  plain,
  respond,
  review,
  system,
  written,
} from './shared/.claude/hooks/guard.mjs';
import { owner as commitOwner } from './src/rules/identity.ts';
import { repo, sandbox } from './test/sandbox.ts';

const me = 'zigordev <zigordev@gmail.com>';
const stranger = 'Someone <someone@example.com>';
const trailer = 'Co-Authored-By: Someone <someone@example.com>';
const script = fileURLToPath(new URL('./shared/.claude/hooks/guard.mjs', import.meta.url));
const launcher = fileURLToPath(new URL('./shared/.claude/hooks/guard.sh', import.meta.url));

function probe(overrides = {}) {
  return {
    scoped: () => true,
    identity: () => ({ author: me, committer: me }),
    branch: () => 'feat/x',
    destination: () => 'feat/x',
    login: () => 'zigordev',
    read: () => undefined,
    exists: () => true,
    home: () => '/repo',
    ignored: () => false,
    check: () => ({ code: 0, output: '' }),
    ...overrides,
  };
}

function event(command, cwd = '/repo') {
  return { hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd, tool_input: { command } };
}

function bash(command, overrides, cwd) {
  return decide(event(command, cwd), probe(overrides));
}

function words(command) {
  return parse(command).commands.map((entry) => entry.words);
}

const boxes = [];

function box(files) {
  const made = sandbox(files);
  boxes.push(made);
  return made;
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const made of boxes.splice(0)) {
    made.remove();
  }
});

describe('reading a command', () => {
  it('splits on every operator', () => {
    expect(words('a && b || c; d | e & f')).toEqual([['a'], ['b'], ['c'], ['d'], ['e'], ['f']]);
  });

  it('keeps quoted text in one word', () => {
    expect(words(`echo "a && b" 'c ; d'`)).toEqual([['echo', 'a && b', 'c ; d']]);
  });

  it('treats the body of a here-document as data', () => {
    const read = parse("cat > f <<'EOF'\ngit push origin main\nEOF\nls");
    expect(read.commands.map((entry) => entry.words)).toEqual([['cat', '>', 'f'], ['ls']]);
    expect(read.heredocs).toEqual(['git push origin main']);
  });

  it('strips the tabs of an indented here-document', () => {
    const read = parse('cat <<-EOF\n\ttext\n\tEOF\nls');
    expect(read.heredocs).toEqual(['\ttext']);
    expect(read.commands.map((entry) => entry.words)).toEqual([['cat'], ['ls']]);
  });

  it('reads a here-document that never ends', () => {
    expect(parse('cat <<EOF\nleft open').heredocs).toEqual(['left open']);
  });

  it('reads the commands inside a substitution, and keeps its text in the outer command', () => {
    const text = `git commit -m "$(cat <<'EOF'\nfeat: x (y)\nEOF\n)"`;
    const read = parse(text);
    expect(read.commands.map((entry) => entry.words)).toEqual([
      ['cat'],
      ['git', 'commit', '-m', '$()'],
    ]);
    expect(read.commands[1].raw).toBe(text);
    expect(read.heredocs).toEqual(['feat: x (y)']);
  });

  it('reads backticks, bare substitutions and nested groups', () => {
    expect(words('echo `git status`')).toEqual([
      ['git', 'status'],
      ['echo', '$()'],
    ]);
    expect(words('x=$(git status) "`pwd`"')).toEqual([
      ['git', 'status'],
      ['pwd'],
      ['x=$()', '$()'],
    ]);
    expect(words('echo $( (a) )')).toEqual([['a'], ['echo', '$()']]);
    expect(words('(cd x && git status)')).toEqual([
      ['cd', 'x'],
      ['git', 'status'],
    ]);
  });

  it('drops a comment and keeps a hash inside a word', () => {
    expect(words('ls # git push origin main')).toEqual([['ls']]);
    expect(words('ls # to the end')).toEqual([['ls']]);
    expect(words('echo a#b')).toEqual([['echo', 'a#b']]);
  });

  it('keeps redirections and here-strings inside their command', () => {
    expect(words('cmd 2>&1 && other')).toEqual([['cmd', '2>&1'], ['other']]);
    expect(words('cmd &> out')).toEqual([['cmd', '&>', 'out']]);
    expect(words('cat <<< "x"; ls')).toEqual([['cat', '<<<', 'x'], ['ls']]);
  });

  it('reads escapes, joined lines and unfinished quotes', () => {
    expect(words("echo $'it\\'s' done")).toEqual([['echo', "it's", 'done']]);
    expect(words('git \\\n push')).toEqual([['git', 'push']]);
    expect(words('echo a\\ b "c \\" d"')).toEqual([['echo', 'a b', 'c " d']]);
    expect(words("echo 'abc")).toEqual([['echo', 'abc']]);
    expect(words('echo "abc')).toEqual([['echo', 'abc']]);
    expect(words("echo $'abc")).toEqual([['echo', 'abc']]);
    expect(words('echo abc\\')).toEqual([['echo', 'abc']]);
  });
});

describe('finding the program in a command', () => {
  it('sets aside assignments, keywords and wrappers', () => {
    expect(plain(['A=1', 'B=two words', 'command', 'git', 'x'])).toEqual({
      words: ['git', 'x'],
      env: { A: '1', B: 'two words' },
    });
    expect(plain(['if', '!', 'git', 'diff']).words).toEqual(['git', 'diff']);
    expect(plain(['env', '-i', '-u', 'X', 'A=1', 'git'])).toEqual({
      words: ['git'],
      env: { A: '1' },
    });
    expect(plain(['timeout', '--foreground', '30', 'git', 'push']).words).toEqual(['git', 'push']);
    expect(plain(['mise', 'exec', '--', 'git', 'push']).words).toEqual(['git', 'push']);
    expect(plain(['mise', 'x', 'node@26', '--', 'pnpm', 'check']).words).toEqual(['pnpm', 'check']);
    expect(plain(['mise', 'exec', 'git']).words).toEqual(['git']);
    expect(plain(['mise', 'install']).words).toEqual(['mise', 'install']);
    expect(plain([])).toEqual({ words: [], env: {} });
  });
});

describe('the identity before a commit', () => {
  it('allows a commit made as the owner', () => {
    expect(bash('git commit -m "feat: add x"')).toBeUndefined();
  });

  it('refuses a commit under another identity', () => {
    const verdict = bash('git commit -m "feat: add x"', {
      identity: () => ({ author: stranger, committer: me }),
    });
    expect(verdict.verdict).toBe('deny');
    expect(verdict.reason).toContain(stranger);
    expect(verdict.reason).toContain(me);
  });

  it('refuses a commit under another committer or with no identity at all', () => {
    expect(
      bash('git merge other', { identity: () => ({ author: me, committer: stranger }) }).reason
    ).toContain(stranger);
    expect(
      bash('git rebase main', { identity: () => ({ author: undefined, committer: undefined }) })
        .reason
    ).toContain('"nobody"');
  });

  it('reads an author given on the command line', () => {
    expect(bash(`git commit --author='${stranger}' -m x`).verdict).toBe('deny');
    expect(bash(`git commit --author "${stranger}" -m x`).verdict).toBe('deny');
    expect(bash(`git commit --author="${me}" -m x`)).toBeUndefined();
  });

  it('hands the overrides in the command to the identity check', () => {
    const seen = [];
    bash('GIT_AUTHOR_NAME=x git -c user.name=y --no-pager --git-dir .git commit -m z', {
      identity: (...args) => {
        seen.push(args);
        return { author: me, committer: me };
      },
    });
    expect(seen).toEqual([['/repo', ['user.name=y'], { GIT_AUTHOR_NAME: 'x' }]]);
  });

  it('follows the folder a command moves to', () => {
    const seen = [];
    const overrides = {
      scoped: (dir) => {
        seen.push(dir);
        return true;
      },
    };
    bash('cd /a/b && git commit -m x', overrides);
    bash('git -C sub commit -m x', overrides);
    bash('pushd ../other; git commit -m x', overrides);
    bash('cd && git commit -m x', overrides);
    bash('cd ~/x && git commit -m x', overrides);
    bash('cd "$HOME/y" && git commit -m x', overrides);
    expect(seen).toEqual([
      '/a/b',
      '/repo/sub',
      '/other',
      homedir(),
      join(homedir(), 'x'),
      join(homedir(), 'y'),
    ]);
  });

  it('leaves a commit alone when the folder cannot be known', () => {
    const overrides = { identity: () => ({ author: stranger, committer: stranger }) };
    expect(bash('cd "$SOMEWHERE" && git commit -m x', overrides)).toBeUndefined();
    expect(bash('cd - && git commit -m x', overrides)).toBeUndefined();
    expect(bash('git -C "$(pwd)" commit -m x', overrides)).toBeUndefined();
    expect(
      decide({ tool_input: { command: 'cd x && git commit -m y' } }, probe(overrides))
    ).toBeUndefined();
    expect(decide({}, probe(overrides))).toBeUndefined();
  });

  it('leaves other repos and other git commands alone', () => {
    const overrides = { identity: () => ({ author: stranger, committer: stranger }) };
    expect(bash('git commit -m x', { ...overrides, scoped: () => false })).toBeUndefined();
    expect(bash('git status', overrides)).toBeUndefined();
    expect(bash('git', overrides)).toBeUndefined();
  });
});

describe('skipping the git hooks', () => {
  it.each([
    'git commit --no-verify -m x',
    'git commit -n -m x',
    'git commit -anm x',
    'git -c core.hooksPath=/dev/null commit -m x',
    'LEFTHOOK=0 git commit -m x',
    'LEFTHOOK=false git push -u origin feat/x',
    'git push --no-verify origin feat/x',
  ])('asks the owner before %s', (command) => {
    expect(bash(command).verdict).toBe('ask');
  });

  it.each([
    'git commit -m "-n is a flag"',
    'git commit -m note',
    'git merge -n other',
    'LEFTHOOK=1 git commit -m x',
    'git push -n origin feat/x',
  ])('does not ask before %s', (command) => {
    expect(bash(command)).toBeUndefined();
  });
});

describe('attribution lines', () => {
  it('refuses one in a commit message', () => {
    expect(bash(`git commit -m "feat: add x\n\n${trailer}"`).verdict).toBe('deny');
    expect(bash(`git commit -F - <<'EOF'\nfeat: add x\n\n${trailer}\nEOF`).verdict).toBe('deny');
    expect(bash(`git commit -m "$(cat <<'EOF'\nfeat: add x\n\n${trailer}\nEOF\n)"`).verdict).toBe(
      'deny'
    );
    expect(bash(`git tag -a v1 -m "${trailer}"`).verdict).toBe('deny');
  });

  it('refuses one in a message file', () => {
    const seen = [];
    const overrides = {
      read: (path) => {
        seen.push(path);
        return trailer;
      },
    };
    expect(bash('git commit -F message.txt', overrides).verdict).toBe('deny');
    expect(bash('git commit --file=notes/message.txt', overrides).verdict).toBe('deny');
    expect(bash('git commit -F -', overrides)).toBeUndefined();
    expect(bash('git commit -F', overrides)).toBeUndefined();
    expect(bash('git commit -F missing.txt')).toBeUndefined();
    expect(seen).toEqual(['/repo/message.txt', '/repo/notes/message.txt']);
  });

  it('refuses one in any repo', () => {
    expect(bash(`git commit -m "${trailer}"`, { scoped: () => false }).verdict).toBe('deny');
    expect(bash(`cd "$X" && git commit -m "${trailer}"`).verdict).toBe('deny');
  });

  it('refuses one in text sent with gh', () => {
    expect(bash(`gh pr create --title x --body "${trailer}"`).verdict).toBe('deny');
    expect(bash(`gh pr edit 3 --body-file - <<'EOF'\n${trailer}\nEOF`).verdict).toBe('deny');
    expect(
      bash('gh pr create --title x --body-file body.md', { read: () => trailer }).verdict
    ).toBe('deny');
    expect(bash('gh release create v1 -F notes.md', { read: () => trailer }).verdict).toBe('deny');
    expect(bash('gh api --input body.json repos/o/r/issues', { read: () => trailer }).verdict).toBe(
      'deny'
    );
    expect(
      bash(`cd "$X" && gh issue create -t x -F body.md`, { read: () => trailer })
    ).toBeUndefined();
  });

  it('allows ordinary words and text that is not sent anywhere', () => {
    expect(
      bash('git commit -m "build: use the client generated with openapi-typescript"')
    ).toBeUndefined();
    expect(bash(`cat > notes.md <<'EOF'\n${trailer}\nEOF`)).toBeUndefined();
    expect(bash(`gh pr view 3 --json body --jq '.body' | grep -c "${trailer}"`)).toBeUndefined();
  });

  it('uses the same pattern and the same identity as the other checks', () => {
    expect(attribution.source).toBe(commitAttribution.source);
    expect(attribution.flags).toBe(commitAttribution.flags);
    expect(`${owner.name} <${owner.email}>`).toBe(commitOwner);
  });
});

describe('a push', () => {
  it.each([
    'git push origin main',
    'git push origin HEAD:main',
    'git push origin feat/x:refs/heads/main',
    'git push origin +main',
    'git push --delete origin main',
    'git push -d origin main',
    'git push origin :main',
    'git push --all origin',
    'git push --mirror',
  ])('refuses %s', (command) => {
    const verdict = bash(command);
    expect(verdict.verdict).toBe('deny');
    expect(verdict.reason).toContain('Nothing is pushed to main');
  });

  it('refuses a plain push that would land on main', () => {
    expect(bash('git push', { destination: () => 'main' }).verdict).toBe('deny');
    expect(bash('git push origin', { destination: () => 'main' }).verdict).toBe('deny');
    expect(bash('git push origin HEAD', { branch: () => 'main' }).verdict).toBe('deny');
    expect(bash('git push origin @', { branch: () => 'main' }).verdict).toBe('deny');
  });

  it.each([
    'git push',
    'git push -u origin feat/x',
    'git push origin HEAD',
    'git push -o ci.skip origin feat/x',
    'git push -f origin feat/x',
    'git push --force-with-lease origin feat/x',
    'git push origin +feat/x',
    'git push --delete origin feat/old',
  ])('allows %s', (command) => {
    expect(bash(command)).toBeUndefined();
  });

  it.each([
    'git push --force origin other',
    'git push -fu origin other',
    'git push --force-with-lease=other origin other',
    'git push origin +other',
  ])('asks the owner before %s', (command) => {
    const verdict = bash(command);
    expect(verdict.verdict).toBe('ask');
    expect(verdict.reason).toContain('force push');
  });

  it('asks before a force push from a detached checkout', () => {
    expect(bash('git push --force origin HEAD', { branch: () => undefined }).verdict).toBe('ask');
  });

  it('refuses a push while gh acts as another account', () => {
    const verdict = bash('git push -u origin feat/x', { login: () => 'someone-else' });
    expect(verdict.verdict).toBe('deny');
    expect(verdict.reason).toContain('gh auth switch -u zigordev');
    expect(bash('git push -u origin feat/x', { login: () => undefined })).toBeUndefined();
  });

  it('leaves other repos alone', () => {
    expect(
      bash('git push origin main', { scoped: () => false, login: () => 'someone-else' })
    ).toBeUndefined();
  });
});

describe('gh', () => {
  it.each([
    'gh pr view 3',
    'gh pr checks 3 --watch',
    'gh run list --limit 5',
    'gh api repos/zigordev/toolkit',
    'gh api -H "Accept: application/json" repos/o/r --jq .name',
    'gh api -X GET search/issues -f q=x',
    'gh api repos/o/r/actions/runs/12/pending_deployments',
    'gh api graphql -f query="query { viewer { login } }"',
    'gh auth status',
    'gh --version',
    'gh',
  ])('lets %s through as any account', (command) => {
    expect(bash(command, { login: () => 'someone-else' })).toBeUndefined();
  });

  it('refuses a change while gh acts as another account', () => {
    const other = { login: () => 'someone-else' };
    const away = { ...other, scoped: () => false };
    expect(bash('gh pr create --title x --body y', other).verdict).toBe('deny');
    expect(bash('gh pr create -R zigordev/toolkit --title x --body y', away).verdict).toBe('deny');
    expect(bash('gh issue comment 3 --repo=zigordev/toolkit --body y', away).verdict).toBe('deny');
    expect(bash('gh api -X POST repos/zigordev/x/issues -f title=y', away).verdict).toBe('deny');
    expect(bash('gh repo create zigordev/new --public', away).verdict).toBe('deny');
    expect(bash('cd "$X" && gh repo create zigordev/new --public', other).verdict).toBe('deny');
    expect(bash('gh copilot explain x', other).verdict).toBe('deny');
  });

  it('leaves a change in another account’s repo alone', () => {
    const other = { login: () => 'someone-else' };
    expect(bash('gh pr create -R other/repo --title x --body y', other)).toBeUndefined();
    expect(
      bash('gh pr create --title x --body y', { ...other, scoped: () => false })
    ).toBeUndefined();
    expect(bash('cd "$X" && gh pr create --title x --body y', other)).toBeUndefined();
    expect(bash('gh pr create --title x --body y', { login: () => undefined })).toBeUndefined();
  });

  it.each([
    'gh pr review 3 --approve',
    'gh pr review 3 -a',
    'gh pr merge 3 --admin --squash',
    'gh api -X POST repos/o/r/actions/runs/12/pending_deployments -f state=approved',
    'gh api --method POST repos/o/r/actions/runs/12/approve',
    'gh api -XPOST repos/o/r/actions/runs/12/deployment_protection_rule -f state=approved',
  ])('refuses the approval in %s', (command) => {
    const verdict = bash(command);
    expect(verdict.verdict).toBe('deny');
    expect(verdict.reason).toContain('approval');
  });

  it.each([
    'gh pr review 3 --comment -b "looks fine"',
    'gh pr merge 3 --auto --squash',
    'gh pr ready 3',
  ])('allows %s', (command) => {
    expect(bash(command)).toBeUndefined();
  });

  it.each([
    'gh pr edit 3 --add-label approved',
    'gh pr edit 3 --remove-label=approved',
    'gh issue create -l bug -t x',
    'gh api -X POST repos/o/r/issues/3/labels -f "labels[]=x"',
  ])('asks the owner before the label change in %s', (command) => {
    const verdict = bash(command);
    expect(verdict.verdict).toBe('ask');
    expect(verdict.reason).toContain('label');
  });

  it('asks the owner before a change made through the API', () => {
    expect(bash('gh api -X PUT repos/o/r/vulnerability-alerts').reason).toContain(
      'PUT repos/o/r/vulnerability-alerts'
    );
    expect(bash('gh api --method=PATCH repos/o/r -f has_wiki=false').reason).toContain('PATCH');
    expect(bash('gh api -XDELETE repos/o/r/rulesets/1').reason).toContain('DELETE');
    expect(bash('gh api repos/o/r/rulesets -f name=x').reason).toContain('POST repos/o/r/rulesets');
    expect(bash('gh api repos/o/r/rulesets --field=name=x').reason).toContain('POST');
    expect(bash('gh api repos/o/r/rulesets --input rules.json').reason).toContain('POST');
    expect(bash('gh api repos/o/r/rulesets -f').reason).toContain('POST');
    expect(bash('gh api -X')).toBeUndefined();
    expect(bash('gh api graphql -f query="mutation { x }"').verdict).toBe('ask');
    expect(bash('gh api graphql -F query=@change.graphql').verdict).toBe('ask');
    expect(bash('gh api -X POST graphql').verdict).toBe('ask');
  });
});

describe('commands inside other commands', () => {
  it.each([
    "bash -c 'git push origin main'",
    'bash -lc "cd /x && git push origin main"',
    'eval "git push origin main"',
    'mise exec -- git push origin main',
    'command git push origin main',
    '/usr/bin/git push origin main',
    'if git push origin main; then echo done; fi',
    'echo "$(git push origin main)"',
    'ls && { git push origin main; }',
  ])('still refuses %s', (command) => {
    expect(bash(command).verdict).toBe('deny');
  });

  it.each([
    'echo "git push origin main"',
    "grep -r 'git push origin main' .",
    'sh deploy.sh',
    'bash',
    'eval',
  ])('lets %s through', (command) => {
    expect(bash(command)).toBeUndefined();
  });

  it('puts a refusal before a question', () => {
    expect(bash('git push --no-verify origin main').verdict).toBe('deny');
  });
});

describe('the answer to the hook', () => {
  const answer = (input, overrides) =>
    respond(typeof input === 'string' ? input : JSON.stringify(input), probe(overrides));

  it('says nothing when the command may run', () => {
    expect(answer(event('git status'))).toEqual({ code: 0, stdout: '', stderr: '' });
  });

  it('answers a refusal and a question in the hook format', () => {
    const refused = answer(event('git push origin main'));
    expect(refused.code).toBe(0);
    expect(JSON.parse(refused.stdout)).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          'Nothing is pushed to main. Push the working branch and open a pull request.',
      },
    });
    const asked = JSON.parse(answer(event('git commit --no-verify -m x')).stdout);
    expect(asked.hookSpecificOutput.permissionDecision).toBe('ask');
  });

  it('refuses a command it fails to read', () => {
    const failed = answer(event('git commit -m x'), {
      scoped: () => {
        throw new Error('boom');
      },
    });
    const output = JSON.parse(failed.stdout).hookSpecificOutput;
    expect(output.permissionDecision).toBe('deny');
    expect(output.permissionDecisionReason).toContain('boom');
  });

  it('stays quiet for input it does not handle', () => {
    const quiet = { code: 0, stdout: '', stderr: '' };
    expect(answer('not json')).toEqual(quiet);
    expect(answer('null')).toEqual(quiet);
    expect(answer({ hook_event_name: 'PreToolUse', tool_name: 'Write' })).toEqual(quiet);
    expect(answer({ hook_event_name: 'Stop' })).toEqual(quiet);
    expect(answer({ hook_event_name: 'PostToolUse', tool_name: 'Read' })).toEqual(quiet);
  });

  it('reports a comment in a file that was just written', () => {
    const noisy = {
      check: () => ({
        code: 1,
        output: 'src/a.ts:3  comments  a comment\nzigordev check: 1 finding (comments)\n',
      }),
    };
    const written = { hook_event_name: 'PostToolUse', tool_name: 'Write' };
    const reply = answer({ ...written, tool_input: { file_path: '/repo/src/a.ts' } }, noisy);
    expect(reply.code).toBe(2);
    expect(reply.stderr).toContain('src/a.ts:3  comments  a comment');
    expect(reply.stderr).toContain('Remove it');
    expect(answer({ ...written, tool_input: { file_path: '/repo/src/a.ts' } })).toEqual({
      code: 0,
      stdout: '',
      stderr: '',
    });
  });
});

describe('the files a tool wrote', () => {
  it('names the file of a write or an edit', () => {
    expect(written({ tool_name: 'Write', tool_input: { file_path: '/a' } })).toEqual(['/a']);
    expect(written({ tool_name: 'Edit', tool_input: { file_path: '/b' } })).toEqual(['/b']);
    expect(written({ tool_name: 'Edit', tool_input: {} })).toEqual([]);
    expect(written({ tool_name: 'Read', tool_input: { file_path: '/c' } })).toEqual([]);
  });

  it('names the files a shell command changed', () => {
    const response = { bashEditDiff: { changedFiles: ['/a', 7, '/b'] } };
    expect(written({ tool_name: 'Bash', tool_response: response })).toEqual(['/a', '/b']);
    expect(written({ tool_name: 'Bash', tool_response: {} })).toEqual([]);
    expect(written({ tool_name: 'Bash' })).toEqual([]);
  });

  it('checks each file with the command of its own repo', () => {
    const seen = [];
    const findings = review(
      ['/one/src/a.ts', '/one/b.md', '/two/c.ts', '/gone.ts', '/nowhere/d.ts', '/one/dist/e.js'],
      probe({
        exists: (file) => file !== '/gone.ts',
        home: (file) =>
          file.startsWith('/one') ? '/one' : file.startsWith('/two') ? '/two' : undefined,
        ignored: (_root, file) => file.includes('/dist/'),
        check: (root, paths) => {
          seen.push([root, paths]);
          return root === '/one'
            ? { code: 1, output: 'a.ts:1  comments  x\nzigordev check: 1 finding (comments)\n' }
            : { code: 2, output: 'usage' };
        },
      })
    );
    expect(seen).toEqual([
      ['/one', ['src/a.ts', 'b.md']],
      ['/two', ['c.ts']],
    ]);
    expect(findings).toEqual(['a.ts:1  comments  x\nzigordev check: 1 finding (comments)']);
    expect(review(['/one/a.ts'], probe({ check: () => ({ code: 1, output: '' }) }))).toEqual([]);
    expect(review(['/one/a.ts'], probe({ check: () => ({ code: null, output: '' }) }))).toEqual([]);
  });
});

describe('what the guard reads from the machine', () => {
  it('knows a zigordev repo by its remote or by its own copy of the guard', () => {
    const https = box();
    repo(https);
    https.git('remote', 'add', 'origin', 'https://github.com/zigordev/toolkit.git');
    const ssh = box();
    repo(ssh);
    ssh.git('remote', 'add', 'origin', 'git@github.com:zigordev/toolkit.git');
    const foreign = box();
    repo(foreign);
    foreign.git('remote', 'add', 'origin', 'https://github.com/someone/thing.git');
    const fresh = box({ '.claude/hooks/guard.mjs': '' });
    repo(fresh);
    const plain = box();
    expect(system.scoped(https.root)).toBe(true);
    expect(system.scoped(ssh.root)).toBe(true);
    expect(system.scoped(foreign.root)).toBe(false);
    expect(system.scoped(fresh.root)).toBe(true);
    expect(system.scoped(plain.root)).toBe(false);
  });

  it('reads the identity a commit would carry', () => {
    const made = box();
    repo(made, stranger);
    expect(system.identity(made.root, [], {})).toEqual({ author: stranger, committer: stranger });
    expect(
      system.identity(made.root, ['user.name=Other', 'user.email=other@example.com'], {}).author
    ).toBe('Other <other@example.com>');
    expect(
      system.identity(made.root, [], {
        GIT_AUTHOR_NAME: 'Env',
        GIT_AUTHOR_EMAIL: 'env@example.com',
      })
    ).toEqual({ author: 'Env <env@example.com>', committer: stranger });
    expect(system.identity(join(made.root, 'missing'), [], {})).toEqual({
      author: undefined,
      committer: undefined,
    });
  });

  it('reads the branch and where a plain push would land', () => {
    const remote = box();
    remote.git('init', '-q', '--bare');
    const made = box();
    repo(made);
    expect(system.branch(made.root)).toBe('main');
    expect(system.destination(made.root)).toBe('main');
    made.commit('chore: start');
    made.git('remote', 'add', 'origin', remote.root);
    made.git('switch', '-q', '-c', 'feat/x');
    made.git('push', '-q', '-u', 'origin', 'feat/x');
    expect(system.branch(made.root)).toBe('feat/x');
    expect(system.destination(made.root)).toBe('feat/x');
  });

  it('reads the account gh acts as, unless a token decides it', () => {
    vi.stubEnv('GH_TOKEN', '');
    vi.stubEnv('GITHUB_TOKEN', '');
    expect(['undefined', 'string']).toContain(typeof system.login());
    vi.stubEnv('GITHUB_TOKEN', 'token');
    expect(system.login()).toBeUndefined();
  });

  it('reads files, and finds the repo that owns one', () => {
    const made = box({
      'src/a.ts': 'export const a = 1;\n',
      'node_modules/@zigordev/dev/bin/zigordev.js':
        "process.stdout.write(process.argv.slice(2).join(' ') + '\\n');\nprocess.exit(1);\n",
      '.gitignore': 'dist/\n',
    });
    repo(made);
    const root = realpathSync(made.root);
    const lonely = box({ 'a.ts': '' });
    expect(system.read(join(root, 'src/a.ts'))).toBe('export const a = 1;\n');
    expect(system.read(join(root, 'missing.ts'))).toBeUndefined();
    expect(system.exists(join(root, 'src/a.ts'))).toBe(true);
    expect(system.exists(join(root, 'missing.ts'))).toBe(false);
    expect(system.home(join(root, 'src/a.ts'))).toBe(root);
    expect(system.home(join(realpathSync(lonely.root), 'a.ts'))).toBeUndefined();
    expect(system.ignored(root, join(root, 'dist/a.js'))).toBe(true);
    expect(system.ignored(root, join(root, 'src/a.ts'))).toBe(false);
    expect(system.check(root, ['src/a.ts'])).toEqual({
      code: 1,
      output: 'check comments src/a.ts\n',
    });
  });

  it('runs as a hook: it reads the event on stdin and answers on stdout', () => {
    const made = box({ '.claude/hooks/guard.mjs': '' });
    repo(made);
    const result = spawnSync(process.execPath, [script], {
      input: JSON.stringify(event('git push origin main', made.root)),
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision).toBe('deny');
    const idle = spawnSync(process.execPath, [script], {
      input: JSON.stringify(event('ls', made.root)),
      encoding: 'utf8',
    });
    expect(idle).toMatchObject({ status: 0, stdout: '', stderr: '' });
  });
});

describe('the launcher', () => {
  function launch(input, code = 0) {
    const made = box({
      'bin/node': `#!/bin/sh\ncat > "$(dirname "$0")/../seen.json"\nexit ${code}\n`,
    });
    chmodSync(join(made.root, 'bin/node'), 0o755);
    const result = spawnSync('sh', [launcher], {
      input,
      encoding: 'utf8',
      env: { PATH: `${join(made.root, 'bin')}:/usr/bin:/bin` },
    });
    const seen = join(made.root, 'seen.json');
    return {
      status: result.status,
      seen: existsSync(seen) ? readFileSync(seen, 'utf8') : undefined,
    };
  }

  it('answers at once for a command that names neither git nor gh', () => {
    const input = JSON.stringify({
      effort: { level: 'high' },
      tool_input: { command: 'pnpm check' },
    });
    expect(launch(input)).toEqual({ status: 0, seen: undefined });
  });

  it.each([
    { tool_input: { command: 'cd toolkit && git status' } },
    { tool_input: { command: 'gh pr view 3' } },
    { tool_input: { file_path: '/repo/a.ts' } },
    { tool_response: { bashEditDiff: { changedFiles: [] } } },
  ])('hands %j to the guard and passes its exit code on', (event) => {
    const input = JSON.stringify(event);
    expect(launch(input, 2)).toEqual({ status: 2, seen: input });
  });
});
