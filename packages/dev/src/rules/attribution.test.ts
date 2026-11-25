import { afterEach, describe, expect, it } from 'vitest';
import { repo, type Sandbox, sandbox } from '../../test/sandbox.ts';
import { attribution } from './attribution.ts';

const trailer = 'Co-Authored-By: Someone <someone@example.com>';
const renovate = 'renovate[bot] <29139614+renovate[bot]@users.noreply.github.com>';
const github = 'GitHub <noreply@github.com>';
const addedByGithub = `Co-authored-by: ${renovate}`;
const squashed = [
  'chore(deps): update jdx/mise-action action to v5.3.0 (#10)',
  '',
  'This PR contains the following updates:',
  '',
  '| Package | Type | Update | Change |',
  '|---|---|---|---|',
  '| [jdx/mise-action](https://redirect.github.com/jdx/mise-action) | action | minor | `v5.2.10` → `v5.3.0` |',
].join('\n');
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

  it('accepts the co-author line that GitHub adds when it squashes a pull request of Renovate', () => {
    start();
    box.commit(`${squashed}\n\n${addedByGithub}`, renovate, github);
    expect(run()).toEqual([]);
  });

  it('accepts that line with a carriage return behind it, as a description from the site can end', () => {
    start();
    box.commit(`${squashed}\r\n\r\n${addedByGithub}\r\n`, renovate, github);
    expect(run()).toEqual([]);
  });

  it('reports the same line on a commit that Renovate did not author', () => {
    start();
    box.commit(`feat: one\n\n${addedByGithub}`);
    expect(run()).toEqual([`commit: ${message}`]);
  });

  it('reports any other co-author on a commit of Renovate, beside the line it accepts', () => {
    start();
    box.commit(`${squashed}\n\n${addedByGithub}\n${trailer}`, renovate, github);
    expect(run()).toEqual([`commit: ${message}`]);
  });

  it.each([
    [
      'in other letters',
      'Co-Authored-By: renovate[bot] <29139614+renovate[bot]@users.noreply.github.com>',
    ],
    ['under another address', 'Co-authored-by: renovate[bot] <bot@renovateapp.com>'],
    [
      'under another name',
      'Co-authored-by: Renovate Bot <29139614+renovate[bot]@users.noreply.github.com>',
    ],
    ['with more on the line', `${addedByGithub} and Someone <someone@example.com>`],
    ['not at the start of the line', `  ${addedByGithub}`],
  ])('reports the line on a commit of Renovate when it names Renovate %s', (_case, line) => {
    start();
    box.commit(`${squashed}\n\n${line}`, renovate, github);
    expect(run()).toEqual([`commit: ${message}`]);
  });

  it('reports every other attribution line on a commit of Renovate', () => {
    start();
    box.commit(`${squashed}\n\nGenerated with [Claude Code]\n\n${addedByGithub}`, renovate, github);
    expect(run()).toEqual([`commit: ${message}`]);
  });

  it('still reports that line in the title and the description of a pull request', () => {
    start();
    box.commit(squashed, renovate);
    expect(
      run({ PR_TITLE: `chore(deps): update x ${addedByGithub}`, PR_BODY: addedByGithub })
    ).toEqual([`the pull request title: ${message}`, `the pull request description: ${message}`]);
  });

  it('judges each commit by its own author', () => {
    start();
    box.commit('feat: base');
    box.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    box.commit(`${squashed}\n\n${addedByGithub}`, renovate, github);
    box.commit(`feat: two\n\n${addedByGithub}`);
    box.commit(`${squashed}\n\n${addedByGithub}`, renovate, github);
    expect(run()).toEqual([`commit: ${message}`]);
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

describe('a text changed in Fink', () => {
  const fink = 'Co-authored-by: Fink <hello@inlang.com>';
  const translator = 'Ada Lovelace <ada@example.com>';

  function textCommit(paths: readonly string[], text: string): void {
    box.commit('feat: base');
    box.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    for (const path of paths) {
      box.write(path, '{ "greeting": "Hola" }\n');
      box.git('add', path);
    }
    box.commit(text, translator, github);
  }

  it("accepts Fink's own line on a commit that changes only texts in messages/", () => {
    start();
    textCommit(['apps/notes-web/messages/es.json', 'messages/en.json'], `Update texts\n\n${fink}`);

    expect(run({ PR_TITLE: 'Update texts', PR_BODY: `Update texts\r\n\r\n${fink}` })).toEqual([]);
  });

  it("reports Fink's line on a commit that changes anything else as well", () => {
    start();
    textCommit(
      ['apps/notes-web/messages/es.json', 'apps/notes-web/src/page.tsx'],
      `Update\n\n${fink}`
    );

    expect(run({ PR_BODY: `Update\n\n${fink}` })).toEqual([
      `the pull request description: ${message}`,
      `commit: ${message}`,
    ]);
  });

  it('reports any other co-author line on a commit of texts', () => {
    start();
    textCommit(['messages/en.json'], `Update\n\n${trailer}`);

    expect(run()).toEqual([`commit: ${message}`]);
  });
});
