import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const workflow = read('../../../.github/workflows/check.yml');
const page = read('../../../docs/handbook/licences.md');

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
      'Artistic-2.0',
      'BlueOak-1.0.0',
      'BSD-2-Clause',
      'BSD-3-Clause',
      'CC-BY-3.0',
      'CC0-1.0',
      'ISC',
      'MIT',
      'MPL-2.0',
      'PSF-2.0',
      'Python-2.0',
    ]);
  });

  it('explains every allowed licence in the handbook, and no other', () => {
    const explained = page
      .split('\n')
      .filter(
        (line) => line.startsWith('| ') && !line.startsWith('| Licence') && !line.startsWith('| -')
      )
      .map((line) => line.split('|')[1]?.trim());
    expect(explained).toEqual(setting('allow-licenses')?.split(', '));
  });

  it('holds no list of forbidden licences, which the action is about to drop', () => {
    expect(workflow).not.toContain('deny-licenses');
  });
});
