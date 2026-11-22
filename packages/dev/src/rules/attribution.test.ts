import { afterEach, describe, expect, it } from 'vitest';
import { repo, type Sandbox, sandbox } from '../../test/sandbox.ts';
import { attribution } from './attribution.ts';

const trailer = 'Co-Authored-By: Someone <someone@example.com>';
const message = 'the text carries an attribution line, so remove it';
const pullRequest = { CI: 'true', GITHUB_EVENT_NAME: 'pull_request' };
let box: Sandbox;

function run(env: Record<string, string> = {}): string[] {
  return attribution
    .run({ root: box.root, files: [], env })
    .map((finding) => `${finding.path.replace(/commit \w+/, 'commit')}: ${finding.message}`);
}

function start(): void {
  box = sandbox();
  repo(box);
}

afterEach(() => {
  box.remove();
});

describe('the attribution rule', () => {
  it('passes in a repo with no commit yet', () => {
    start();
    expect(run()).toEqual([]);
  });

  it('passes for ordinary commits and ordinary pull request text', () => {
    start();
    box.commit('build: use the client generated with openapi-typescript');
    expect(
      run({ PR_TITLE: 'feat(api): add pools', PR_BODY: '## What\n\nAdds the pools endpoint.' })
    ).toEqual([]);
  });

  it('reports an attribution line in the pull request title and description', () => {
    start();
    expect(run({ PR_TITLE: `feat: add x ${trailer}`, PR_BODY: `## What\n\n${trailer}` })).toEqual([
      `the pull request title: ${message}`,
      `the pull request description: ${message}`,
    ]);
  });

  it('reports an attribution line in a commit that main on GitHub does not have yet', () => {
    start();
    box.commit('feat: one');
    box.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    box.commit(`feat: two\n\nwith a tab\there\n\n${trailer}`);
    box.commit('feat: three');
    expect(run()).toEqual([`commit: ${message}`]);
  });

  it("reads a pull request's own commits in the pipeline", () => {
    start();
    box.commit('feat: base');
    box.git('switch', '-q', '-c', 'feature');
    box.commit(`feat: work\n\n${trailer}`);
    box.git('switch', '-q', 'main');
    box.git('merge', '-q', '--no-ff', '--no-edit', 'feature');
    expect(run(pullRequest)).toEqual([`commit: ${message}`]);
  });

  it('reads only the text of a pull request that arrives without its commits', () => {
    start();
    box.commit(`feat: one\n\n${trailer}`);
    expect(run(pullRequest)).toEqual([]);
    expect(run({ ...pullRequest, PR_BODY: trailer })).toEqual([
      `the pull request description: ${message}`,
    ]);
  });
});
