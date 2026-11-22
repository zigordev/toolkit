import { afterEach, describe, expect, it } from 'vitest';
import { type Sandbox, sandbox } from '../../test/sandbox.ts';
import { scripts } from './scripts.ts';

const standard = {
  build: 'x',
  check: 'x',
  'check:quick': 'x',
  format: 'x',
  'format:check': 'x',
  lint: 'x',
  test: 'x',
  typecheck: 'x',
};
let box: Sandbox;

function run(files: Record<string, string>): string[] {
  box = sandbox(files);
  return scripts.run({ root: box.root, files: [], env: {} }).map((finding) => finding.message);
}

function manifest(names: Record<string, string>): string {
  return JSON.stringify({ scripts: names });
}

afterEach(() => {
  box.remove();
});

describe('the scripts rule', () => {
  it('passes when package.json has every standard script', () => {
    expect(run({ 'package.json': manifest(standard) })).toEqual([]);
  });

  it('names each standard script that is missing', () => {
    const { 'check:quick': _quick, lint: _lint, ...rest } = standard;
    expect(run({ 'package.json': manifest(rest) })).toEqual([
      'the script "check:quick" is missing',
      'the script "lint" is missing',
    ]);
  });

  it('asks for the local stack scripts when the repo has a compose file', () => {
    expect(run({ 'package.json': manifest(standard), 'compose.yaml': 'services: {}\n' })).toEqual([
      'the script "dev" is missing',
      'the script "local:down" is missing',
      'the script "local:reset" is missing',
      'the script "local:up" is missing',
    ]);
  });

  it('reports a repo without package.json', () => {
    expect(run({})).toEqual(['the file is missing']);
  });

  it('reports a package.json that is not valid JSON', () => {
    expect(run({ 'package.json': '{ scripts' })).toEqual(['the file is not a JSON object']);
  });

  it('reports a package.json that is not an object', () => {
    expect(run({ 'package.json': '"text"' })).toEqual(['the file is not a JSON object']);
  });

  it('treats a package.json without scripts as having none', () => {
    expect(run({ 'package.json': '{}' })).toHaveLength(8);
  });
});
