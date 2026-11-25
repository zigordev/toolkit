import { afterEach, describe, expect, it } from 'vitest';
import { type Sandbox, sandbox } from '../../test/sandbox.ts';
import { flagProblems, flags, today } from './flags.ts';

let box: Sandbox | undefined;

afterEach(() => {
  box?.remove();
  box = undefined;
});

function file(entries: Record<string, unknown>): string {
  return `${JSON.stringify({ $schema: 'https://flagd.dev/schema/v0/flags.json', flags: entries }, null, 2)}\n`;
}

const flag = (removeBy?: unknown) => ({
  state: 'ENABLED',
  variants: { on: true, off: false },
  defaultVariant: 'off',
  ...(removeBy === undefined ? {} : { metadata: { removeBy } }),
});

describe('today', () => {
  it('is the date in UTC, as YYYY-MM-DD', () => {
    expect(today(new Date('2026-11-25T23:30:00-02:00'))).toBe('2026-11-26');
  });
});

describe('flagProblems', () => {
  it('accepts a flag whose removal date is today or later', () => {
    expect(
      flagProblems(file({ a: flag('2026-11-25'), b: flag('2027-06-30') }), '2026-11-25')
    ).toEqual([]);
  });

  it('fails a flag the day after its removal date', () => {
    expect(flagProblems(file({ 'friendly-greeting': flag('2026-11-24') }), '2026-11-25')).toEqual([
      {
        flag: 'friendly-greeting',
        message:
          'the flag "friendly-greeting" passed its removal date, 2026-11-24: remove the flag and the code that asks for it, or move the date in a pull request that says why',
      },
    ]);
  });

  it.each([
    ['no metadata', undefined],
    ['a date in another format', '30/06/2027'],
    ['a date that does not exist', '2027-02-30'],
    ['a number', 20270630],
  ])('fails a flag with %s', (_name, removeBy) => {
    expect(flagProblems(file({ a: flag(removeBy) }), '2026-11-25')).toEqual([
      {
        flag: 'a',
        message:
          'the flag "a" has no removal date: give it "metadata": { "removeBy": "YYYY-MM-DD" }',
      },
    ]);
  });

  it('fails a file that is not JSON, or that holds no flags', () => {
    expect(flagProblems('{ not json', '2026-11-25')).toEqual([{ message: 'the file is not JSON' }]);
    expect(flagProblems('{"flags": []}', '2026-11-25')).toEqual([
      { message: 'the file has no "flags" object' },
    ]);
  });
});

describe('the flags rule', () => {
  it('reads every flags.json of the repo, and names the file and the line of each flag', () => {
    box = sandbox({
      'apps/notes-api/flags.json': file({ kept: flag('2999-12-31'), gone: flag('2020-01-01') }),
      'apps/notes-web/flags.json': file({ undated: flag() }),
      'apps/notes-web/other.json': file({ ignored: flag('2020-01-01') }),
    });

    const findings = flags.run({
      root: box.root,
      files: [
        'apps/notes-api/flags.json',
        'apps/notes-web/flags.json',
        'apps/notes-web/other.json',
      ],
      env: {},
    });

    expect(findings.map(({ path, line, rule }) => ({ path, line, rule }))).toEqual([
      { path: 'apps/notes-api/flags.json', line: 15, rule: 'flags' },
      { path: 'apps/notes-web/flags.json', line: 4, rule: 'flags' },
    ]);
    expect(findings[0]?.message).toContain('"gone" passed its removal date, 2020-01-01');
    expect(findings[1]?.message).toContain('"undated" has no removal date');
  });

  it('finds nothing in a repo without flags', () => {
    box = sandbox({ 'package.json': '{}\n' });

    expect(flags.run({ root: box.root, files: ['package.json'], env: {} })).toEqual([]);
  });

  it('names the file, not a line, when the file itself is wrong', () => {
    box = sandbox({ 'flags.json': '[]\n' });

    expect(flags.run({ root: box.root, files: ['flags.json'], env: {} })).toEqual([
      { rule: 'flags', path: 'flags.json', message: 'the file has no "flags" object' },
    ]);
  });
});
