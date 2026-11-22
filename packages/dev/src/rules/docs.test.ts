import { afterEach, describe, expect, it } from 'vitest';
import { type Sandbox, sandbox } from '../../test/sandbox.ts';
import { docs } from './docs.ts';

const complete = {
  'README.md': '# Repo\n',
  'docs/local-first-start.md': '# Start\n',
  'docs/cloud-first-deploy.md': '# Deploy\n',
  'docs/user-manual.md': '# Manual\n',
  'docs/adr/0001-first.md': '# First\n',
};
let box: Sandbox;

function run(files: Record<string, string>): string[] {
  box = sandbox(files);
  return docs
    .run({ root: box.root, files: [], env: {} })
    .map((finding) => `${finding.path}: ${finding.message}`);
}

afterEach(() => {
  box.remove();
});

describe('the docs rule', () => {
  it('passes when the five standard docs exist', () => {
    expect(run(complete)).toEqual([]);
  });

  it('names each standard doc that is missing', () => {
    const { 'docs/user-manual.md': _manual, 'README.md': _readme, ...rest } = complete;
    expect(run(rest)).toEqual([
      'README.md: the file is missing',
      'docs/user-manual.md: the file is missing',
    ]);
  });

  it('reports a decisions folder without a record', () => {
    const { 'docs/adr/0001-first.md': _record, ...rest } = complete;
    expect(run({ ...rest, 'docs/adr/notes.txt': 'x' })).toEqual([
      'docs/adr: the folder holds no decision record',
    ]);
  });

  it('reports a missing decisions folder', () => {
    const { 'docs/adr/0001-first.md': _record, ...rest } = complete;
    expect(run(rest)).toEqual(['docs/adr: the folder holds no decision record']);
  });

  it('reports a file standing where the decisions folder should be', () => {
    const { 'docs/adr/0001-first.md': _record, ...rest } = complete;
    expect(run({ ...rest, 'docs/adr': 'x' })).toEqual([
      'docs/adr: the folder holds no decision record',
    ]);
  });
});
