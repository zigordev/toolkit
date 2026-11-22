import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const workflow = read('../../../.github/workflows/check.yml');
const release = read('../../../.github/workflows/release.yml');
const caller = read('../../../.github/workflows/ci.yml');

function job(text: string, name: string): string {
  const rest = text.slice(text.indexOf(`\n  ${name}:\n`) + 1);
  const next = /\n {2}\w[\w-]*:\n/.exec(rest);
  return next === null ? rest : rest.slice(0, next.index + 1);
}

function setting(name: string): string | undefined {
  return new RegExp(`^ +${name}: (.+)$`, 'm').exec(workflow)?.[1];
}

describe('the Dependencies job', () => {
  it('fails on a known flaw of any severity', () => {
    expect(setting('fail-on-severity')).toBe('low');
  });
});

describe('the release', () => {
  it('runs after the gate, and only on a push to main', () => {
    expect(job(caller, 'release')).toContain('needs: [check]');
    expect(job(caller, 'release')).toContain("if: github.event_name == 'push'");
  });

  it('lets only the Version job write to the repo', () => {
    expect(job(release, 'version')).toContain('contents: write');
    expect(job(release, 'pack')).not.toContain('write');
    expect(job(release, 'publish')).not.toContain('contents: write');
  });

  it('lets only the Publish job ask for the proof npm trusts, in the environment named release', () => {
    expect(job(release, 'publish')).toContain('id-token: write');
    expect(job(release, 'publish')).toContain('environment: release');
    expect(job(release, 'version')).not.toContain('id-token');
    expect(job(release, 'pack')).not.toContain('id-token');
  });

  it('installs no dependency in the job that can publish', () => {
    expect(job(release, 'publish')).not.toContain('pnpm');
  });

  it('tags nothing while no package is public', () => {
    expect(job(release, 'version')).toContain("if: steps.packages.outputs.public != '0'");
  });
});
