import lint from '@commitlint/lint';
import load from '@commitlint/load';
import { describe, expect, it } from 'vitest';
import config from './commitlint.js';

async function check(message) {
  const loaded = await load(config);
  return lint(message, loaded.rules, {
    parserOpts: loaded.parserPreset?.parserOpts,
    plugins: loaded.plugins,
  });
}

describe('commit rules', () => {
  it('accepts a conventional commit', async () => {
    expect((await check('feat(api): add the pools endpoint')).valid).toBe(true);
  });

  it('accepts generated with in ordinary prose', async () => {
    expect((await check('build: use the client generated with openapi-typescript')).valid).toBe(
      true
    );
  });

  it('rejects a message without a type', async () => {
    expect((await check('added the pools endpoint')).valid).toBe(false);
  });

  it('rejects a capitalised subject with a final period', async () => {
    expect((await check('feat: Add The Pools Endpoint.')).valid).toBe(false);
  });

  it('rejects a Co-Authored-By trailer', async () => {
    const result = await check(
      'feat: add the pools endpoint\n\nCo-Authored-By: Someone <someone@example.com>'
    );
    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.name)).toContain('no-attribution');
  });

  it('rejects a line crediting Claude', async () => {
    const result = await check(
      'fix: handle a missing pool\n\nGenerated with [Claude Code](https://claude.com/claude-code)'
    );
    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.name)).toContain('no-attribution');
  });
});
