import { afterEach, describe, expect, it } from 'vitest';
import { type Sandbox, sandbox } from '../../test/sandbox.ts';
import { actions } from './actions.ts';

const commit = '3d3c42e5aac5ba805825da76410c181273ba90b1';
const digest = `sha256:${'a'.repeat(64)}`;
let box: Sandbox;

function run(files: Record<string, string>): string[] {
  box = sandbox(files);
  return actions
    .run({ root: box.root, files: Object.keys(files), env: {} })
    .map((finding) => `${finding.path}:${finding.line} ${finding.message}`);
}

afterEach(() => {
  box.remove();
});

describe('the actions rule', () => {
  it('passes for actions pinned to a commit with an exact version beside them', () => {
    expect(
      run({
        '.github/workflows/ci.yml': [
          `      - uses: actions/checkout@${commit} # v7.0.1`,
          `        uses: "github/codeql-action/init@${commit}" # 4.39.4-beta.1`,
          '    uses: ./.github/workflows/check.yml',
          '    uses: $/.github/workflows/check.yml',
          `      - uses: docker://ghcr.io/example/tool@${digest}`,
          '      - run: echo "uses: nothing"',
        ].join('\n'),
      })
    ).toEqual([]);
  });

  it('reports an action pinned to a tag', () => {
    expect(run({ '.github/workflows/ci.yaml': '      - uses: actions/checkout@v7\n' })).toEqual([
      '.github/workflows/ci.yaml:1 the action "actions/checkout@v7" is not pinned to a commit',
    ]);
  });

  it('reports a pinned action without its version', () => {
    expect(run({ 'tools/action.yml': `    - uses: actions/checkout@${commit}\n` })).toEqual([
      `tools/action.yml:1 the action "actions/checkout@${commit}" has no exact version after it, such as "# v1.2.3"`,
    ]);
  });

  it('reports a pinned action whose label is not an exact version', () => {
    expect(
      run({ 'action.yaml': `    - uses: actions/checkout@${commit} # latest\n` })
    ).toHaveLength(1);
  });

  it('reports a container that is not pinned to a digest', () => {
    expect(
      run({ '.github/workflows/ci.yml': '      - uses: docker://ghcr.io/example/tool:1.2.3\n' })
    ).toEqual([
      '.github/workflows/ci.yml:1 the action "docker://ghcr.io/example/tool:1.2.3" is not pinned to a digest',
    ]);
  });

  it('reads only workflow and action files', () => {
    expect(
      run({
        'compose.yaml': '      - uses: actions/checkout@v7\n',
        '.github/workflows/notes.md': '      - uses: actions/checkout@v7\n',
      })
    ).toEqual([]);
  });
});
