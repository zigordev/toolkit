import { describe, expect, it } from 'vitest';
import config from './semantic-release.js';

const [analyzer, notes, github] = config.plugins;

describe('the release settings', () => {
  it('release from main only', () => {
    expect(config.branches).toEqual(['main']);
  });

  it('use three plugins in order, and leave the publishing to the pipeline', () => {
    expect(config.plugins.map(([name]) => name)).toEqual([
      '@semantic-release/commit-analyzer',
      '@semantic-release/release-notes-generator',
      '@semantic-release/github',
    ]);
  });

  it('read a title the way commitlint does, in the analyzer and in the notes', () => {
    expect(analyzer[1].preset).toBe('angular');
    expect(notes[1]).toEqual(analyzer[1]);
  });

  it('read the type, the scope and the summary of a title', () => {
    const { headerPattern } = analyzer[1].parserOpts;
    expect(headerPattern.exec('feat(dev): add the release command (#22)')?.slice(1)).toEqual([
      'feat',
      'dev',
      'add the release command (#22)',
    ]);
    expect(headerPattern.exec('fix: read the tag')?.slice(1)).toEqual([
      'fix',
      undefined,
      'read the tag',
    ]);
  });

  it('read an exclamation mark after the type as a breaking change', () => {
    const { headerPattern, breakingHeaderPattern } = analyzer[1].parserOpts;
    expect(headerPattern.exec('feat(api)!: drop the old route')?.[1]).toBe('feat');
    expect(breakingHeaderPattern.test('feat(api)!: drop the old route')).toBe(true);
    expect(breakingHeaderPattern.test('feat!: drop the old route')).toBe(true);
    expect(breakingHeaderPattern.test('feat(api): add a route')).toBe(false);
  });

  it('post no comment, open no issue and add no label, so nothing credits a tool', () => {
    expect(github[1]).toEqual({
      successComment: false,
      failComment: false,
      failTitle: false,
      labels: false,
      releasedLabels: false,
    });
  });
});
