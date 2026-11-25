import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import * as z from 'zod';
import { type Flags, flagsSettings, startFlags } from './index.ts';

const folder = mkdtempSync(join(tmpdir(), 'zigordev-flags-'));

function flagsFile(name: string, flags: Record<string, unknown>): string {
  const path = join(folder, name);
  writeFileSync(
    path,
    JSON.stringify({ $schema: 'https://flagd.dev/schema/v0/flags.json', flags }, null, 2)
  );
  return path;
}

const started: Flags[] = [];

async function start(app: string, file: string): Promise<Flags> {
  const flags = await startFlags({ app, file });
  started.push(flags);
  return flags;
}

afterAll(async () => {
  await Promise.all(started.map((flags) => flags.stop()));
});

describe('flagsSettings', () => {
  it('asks for the path of the flags file', () => {
    const schema = z.object(flagsSettings);

    expect(schema.parse({ FLAGS_FILE: '/app/flags.json' })).toEqual({
      FLAGS_FILE: '/app/flags.json',
    });
    expect(schema.safeParse({}).success).toBe(false);
  });
});

describe('startFlags', () => {
  const file = flagsFile('notes-api.json', {
    'friendly-greeting': {
      state: 'ENABLED',
      variants: { on: true, off: false },
      defaultVariant: 'on',
      metadata: { removeBy: '2027-11-30' },
    },
    'greeting-style': {
      state: 'ENABLED',
      variants: { plain: 'Hello', warm: 'Hi there' },
      defaultVariant: 'plain',
      targeting: { if: [{ '==': [{ var: 'plan' }, 'team'] }, 'warm', 'plain'] },
      metadata: { removeBy: '2027-11-30' },
    },
    'switched-off': {
      state: 'DISABLED',
      variants: { on: true, off: false },
      defaultVariant: 'on',
      metadata: { removeBy: '2027-11-30' },
    },
  });

  it("answers each flag from the app's own file", async () => {
    const { client } = await start('notes-api', file);

    expect(await client.getBooleanValue('friendly-greeting', false)).toBe(true);
    expect(await client.getStringValue('greeting-style', 'Hello')).toBe('Hello');
    expect(await client.getStringValue('greeting-style', 'Hello', { plan: 'team' })).toBe(
      'Hi there'
    );
  });

  it('gives the default the code passed for a flag that is switched off or missing', async () => {
    const { client } = await start('notes-api-defaults', file);

    expect(await client.getBooleanValue('switched-off', false)).toBe(false);
    const missing = await client.getBooleanDetails('no-such-flag', false);
    expect(missing.value).toBe(false);
    expect(missing.errorCode).toBe('FLAG_NOT_FOUND');
  });

  it('reports a health part that is up, and not required', async () => {
    const { health } = await start('notes-api-health', file);

    expect(health).toMatchObject({ name: 'flags', required: false });
    expect(await health.check()).toBe('up');
  });

  it('refuses to start without a readable file, so a broken image never becomes healthy', async () => {
    await expect(startFlags({ app: 'a', file: join(folder, 'missing.json') })).rejects.toThrow(
      /cannot be read/
    );
    const broken = join(folder, 'broken.json');
    writeFileSync(broken, '{ not json');
    await expect(startFlags({ app: 'b', file: broken })).rejects.toThrow(/is not JSON/);
  });
});
