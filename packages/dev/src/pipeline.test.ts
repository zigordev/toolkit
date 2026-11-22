import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const workflow = read('../../../.github/workflows/check.yml');

function setting(name: string): string | undefined {
  return new RegExp(`^ +${name}: (.+)$`, 'm').exec(workflow)?.[1];
}

describe('the Dependencies job', () => {
  it('fails on a known flaw of any severity', () => {
    expect(setting('fail-on-severity')).toBe('low');
  });
});
