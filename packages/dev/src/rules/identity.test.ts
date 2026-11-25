import { afterEach, describe, expect, it } from 'vitest';
import { owner, repo, type Sandbox, sandbox } from '../../test/sandbox.ts';
import { identity } from './identity.ts';

const stranger = 'Someone Else <someone@example.com>';
const renovate = 'renovate[bot] <29139614+renovate[bot]@users.noreply.github.com>';
const github = 'GitHub <noreply@github.com>';
const pipeline = { CI: 'true' };
const pullRequest = { CI: 'true', GITHUB_EVENT_NAME: 'pull_request' };
let box: Sandbox;

function run(env: Record<string, string> = {}): string[] {
  return identity
    .run({ root: box.root, files: [], env })
    .map((finding) => `${finding.path.replace(/commit \w+/, 'commit')}: ${finding.message}`);
}

function start(who: string = owner): void {
  box = sandbox();
  repo(box, who);
}

afterEach(() => {
  box.remove();
});

describe('the identity rule', () => {
  it('passes when the repo is set up to commit as zigordev', () => {
    start();
    expect(run()).toEqual([]);
  });

  it('reports a repo set up to commit as someone else', () => {
    start(stranger);
    expect(run()).toEqual([
      `.git/config: a commit here would be made as "${stranger}", not as "${owner}"`,
    ]);
  });

  it('does not read the configured identity in the pipeline', () => {
    start(stranger);
    expect(run(pipeline)).toEqual([]);
  });

  it('passes for a commit made as zigordev', () => {
    start();
    box.commit('one');
    expect(run()).toEqual([]);
  });

  it('reports the author and the committer of a commit made by someone else', () => {
    start();
    box.commit('one', stranger);
    expect(run()).toEqual([
      `commit: the author is "${stranger}", not "${owner}"`,
      `commit: the committer is "${stranger}", not "${owner}"`,
    ]);
  });

  it('accepts Renovate as an author and GitHub as a committer', () => {
    start();
    box.commit('one', renovate);
    box.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    box.commit('two', owner, github);
    expect(run()).toEqual([]);
  });

  it('reads every commit that main on GitHub does not have yet', () => {
    start();
    box.commit('one');
    box.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    box.commit('two', stranger);
    box.commit('three');
    expect(run(pipeline)).toEqual([
      `commit: the author is "${stranger}", not "${owner}"`,
      `commit: the committer is "${stranger}", not "${owner}"`,
    ]);
  });

  it('reads the last commit when nothing is ahead of main on GitHub', () => {
    start();
    box.commit('one', stranger);
    box.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    expect(run(pipeline)).toHaveLength(2);
  });

  it("reads a pull request's own commits in the pipeline", () => {
    start();
    box.commit('base');
    box.git('switch', '-q', '-c', 'feature');
    box.commit('work', stranger);
    box.git('switch', '-q', 'main');
    box.git('merge', '-q', '--no-ff', '--no-edit', 'feature');
    expect(run(pullRequest)).toEqual([
      `commit: the author is "${stranger}", not "${owner}"`,
      `commit: the committer is "${stranger}", not "${owner}"`,
    ]);
  });

  it('asks for the full history when a pull request arrives without its commits', () => {
    start();
    box.commit('one');
    expect(run(pullRequest)).toEqual([
      "HEAD: the pull request's commits are not in this checkout, so fetch the full history",
    ]);
  });
});

describe('a text changed in Fink', () => {
  const translator = 'Ada Lovelace <ada@example.com>';

  function textCommit(paths: readonly string[]): void {
    box.commit('feat: base');
    box.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    for (const path of paths) {
      box.write(path, '{ "greeting": "Hola" }\n');
      box.git('add', path);
    }
    box.commit('Update texts', translator, github);
  }

  it("accepts a translator's commit that changes only texts in messages/", () => {
    start();
    textCommit(['apps/notes-web/messages/es.json', 'messages/en.json']);

    expect(run()).toEqual([]);
  });

  it("reports a translator's commit that changes anything else as well", () => {
    start();
    textCommit(['apps/notes-web/messages/es.json', 'apps/notes-web/messages/notes.ts']);

    expect(run()).toEqual([`commit: the author is "${translator}", not "${owner}"`]);
  });
});
