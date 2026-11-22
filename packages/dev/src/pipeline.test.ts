import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  new URL('../../../.github/workflows/check.yml', import.meta.url),
  'utf8'
);

function setting(name: string): string | undefined {
  return new RegExp(`^ +${name}: (.+)$`, 'm').exec(workflow)?.[1];
}

describe('the Dependencies job', () => {
  it('fails on a known flaw of any severity', () => {
    expect(setting('fail-on-severity')).toBe('low');
  });

  it('allows only the agreed licences', () => {
    expect(setting('allow-licenses')?.split(', ')).toEqual([
      '0BSD',
      'Apache-2.0',
      'BSD-2-Clause',
      'BSD-3-Clause',
      'ISC',
      'MIT',
      'MPL-2.0',
      'PSF-2.0',
      'Python-2.0',
    ]);
  });

  it('holds no list of forbidden licences, which the action is about to drop', () => {
    expect(workflow).not.toContain('deny-licenses');
  });
});
