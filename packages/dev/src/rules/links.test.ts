import { afterEach, describe, expect, it } from 'vitest';
import { type Sandbox, sandbox } from '../../test/sandbox.ts';
import { links } from './links.ts';

let box: Sandbox;

function run(files: Record<string, string>): string[] {
  box = sandbox(files);
  return links
    .run({ root: box.root, files: Object.keys(files), env: {} })
    .map((finding) => `${finding.path}:${finding.line} ${finding.message}`);
}

afterEach(() => {
  box.remove();
});

describe('the links rule', () => {
  it('passes when every link leads to a file or a folder', () => {
    expect(
      run({
        'README.md': '[guide](docs/guide.md), [folder](docs), [top](/docs/guide.md)\n',
        'docs/guide.md': '[back](../README.md#start) and ![shot](shot%20one.png "A shot")\n',
        'docs/shot one.png': 'x',
      })
    ).toEqual([]);
  });

  it('reports a link that leads nowhere, with its line', () => {
    expect(run({ 'README.md': '# Title\n\nSee [the guide](docs/guide.md).\n' })).toEqual([
      'README.md:3 the link to "docs/guide.md" leads nowhere',
    ]);
  });

  it('leaves web addresses, mail addresses and anchors alone', () => {
    expect(
      run({
        'README.md':
          '[site](https://example.com/a.md) [mail](mailto:a@example.com) [here](#top) [cdn](//example.com/x)\n',
      })
    ).toEqual([]);
  });

  it('ignores links inside code blocks and code spans', () => {
    expect(
      run({
        'README.md': 'Write `[text](missing.md)` like this:\n\n```md\n[text](missing.md)\n```\n',
      })
    ).toEqual([]);
  });

  it('reads only Markdown files', () => {
    expect(run({ 'notes.txt': '[text](missing.md)\n' })).toEqual([]);
  });
});
