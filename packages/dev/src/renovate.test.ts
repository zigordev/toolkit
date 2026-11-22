import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Settings = Readonly<Record<string, unknown>>;

function read(path: string): Settings {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as Settings;
}

const preset = read('../../../renovate/default.json');
const shared = read('../shared/renovate.json');
const rules = preset.packageRules as Settings[];
const own = rules.find((rule) => rule.groupName === 'zigordev');

function names(rule: Settings): readonly string[] {
  return (rule.matchPackageNames as string[] | undefined) ?? [];
}

function ruleFor(updateType: string, packageName?: string): Settings | undefined {
  return rules.find(
    (rule) =>
      ((rule.matchUpdateTypes as string[] | undefined) ?? []).includes(updateType) &&
      (packageName === undefined ? names(rule).length === 0 : names(rule).includes(packageName))
  );
}

describe('the Renovate preset', () => {
  it('is the one preset that every repo extends', () => {
    expect(shared.extends).toEqual(['github>zigordev/toolkit//renovate/default']);
  });

  it('waits one day before it takes a new release', () => {
    expect(preset.minimumReleaseAge).toBe('1 day');
  });

  it('merges only on weekdays between 08:00 and 18:00', () => {
    expect(preset.automergeSchedule).toEqual(['* 8-17 * * 1-5']);
    expect(preset.timezone).toBe('Europe/Madrid');
    expect(preset.platformAutomerge).toBe(false);
  });

  it('merges a patch or a minor update by itself, as a squash', () => {
    expect(ruleFor('patch')?.automerge).toBe(true);
    expect(ruleFor('minor')?.automerge).toBe(true);
    expect(preset.automergeStrategy).toBe('squash');
  });

  it('holds a new major version for a month, and then for a person', () => {
    expect(ruleFor('major')).toMatchObject({ automerge: false, minimumReleaseAge: '30 days' });
  });

  it('never proposes a new major version of Node.js', () => {
    expect(ruleFor('major', 'node')?.enabled).toBe(false);
    expect(ruleFor('major', '@types/node')?.enabled).toBe(false);
  });

  it('takes our own packages and the pipeline a repo calls at once, in one pull request', () => {
    expect(own).toMatchObject({
      matchDepNames: ['@zigordev/**', 'zigordev/toolkit'],
      groupName: 'zigordev',
      minimumReleaseAge: null,
    });
  });

  it('keeps that rule last, so it lifts the month of a major version and nothing else', () => {
    expect(rules.at(-1)).toBe(own);
    expect(Object.keys(own ?? {}).sort()).toEqual([
      'description',
      'groupName',
      'matchDepNames',
      'minimumReleaseAge',
    ]);
    expect(ruleFor('major')?.automerge).toBe(false);
  });

  it('pins every action to a commit, with its exact version beside it', () => {
    expect(preset.extends).toContain('helpers:pinGitHubActionDigestsToSemver');
  });

  it('writes Conventional Commits titles', () => {
    expect(preset.extends).toContain(':semanticCommits');
  });

  it('keeps release notes from elsewhere out of the pull request, and so out of the commit', () => {
    expect(preset.fetchChangeLogs).toBe('off');
    expect(preset.prBodyTemplate).toBe('{{{header}}}{{{table}}}{{{warnings}}}{{{notes}}}');
    expect(preset.prBodyColumns).toEqual(['Package', 'Type', 'Update', 'Change']);
  });

  it('switches off the badges in the repo file, where Renovate reads that for the hosted app', () => {
    expect(shared.ignorePresets).toEqual([
      'mergeConfidence:all-badges',
      'mergeConfidence:age-confidence-badges',
    ]);
    expect(preset.ignorePresets).toBeUndefined();
  });
});
