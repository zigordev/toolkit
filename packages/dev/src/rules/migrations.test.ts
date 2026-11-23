import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { repo, type Sandbox, sandbox } from '../../test/sandbox.ts';
import { deletions, migrations } from './migrations.ts';

let box: Sandbox | undefined;

afterEach(() => {
  box?.remove();
  box = undefined;
});

describe('deletions', () => {
  it.each([
    ['DROP TABLE "notes";', 'DROP TABLE'],
    ['drop table if exists notes cascade;', 'DROP TABLE'],
    ['DROP SCHEMA "archive" CASCADE;', 'DROP SCHEMA'],
    ['DROP DATABASE old;', 'DROP DATABASE'],
    ['TRUNCATE "notes";', 'TRUNCATE'],
    ['DELETE FROM "notes" WHERE "status" = \'done\';', 'DELETE FROM'],
    ['ALTER TABLE "notes" DROP COLUMN "body";', 'DROP COLUMN'],
    ['ALTER TABLE notes DROP body;', 'DROP COLUMN'],
    ['ALTER TABLE "notes" ALTER COLUMN "title" SET DATA TYPE varchar(20);', 'a change of type'],
    [
      'ALTER TABLE notes ALTER title TYPE varchar(20) USING title::varchar(20);',
      'a change of type',
    ],
    ['ALTER TABLE "notes" ADD COLUMN "pinned" boolean, DROP COLUMN "body";', 'DROP COLUMN'],
  ])('finds what deletes data in %s', (sql, what) => {
    expect(deletions(sql)).toEqual([{ line: 1, what }]);
  });

  it.each([
    'CREATE TABLE "notes" ("id" uuid PRIMARY KEY);',
    'ALTER TABLE "notes" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;',
    'DROP INDEX "notes_created_at_id_idx";',
    'ALTER TABLE "notes" DROP CONSTRAINT "notes_status_known";',
    'ALTER TABLE "notes" ALTER COLUMN "body" DROP DEFAULT;',
    'ALTER TABLE "notes" ALTER COLUMN "body" DROP NOT NULL;',
    'ALTER TABLE "notes" RENAME COLUMN "body" TO "text";',
    'INSERT INTO "notes" ("title") VALUES (\'drop table notes; truncate notes\');',
    'CREATE TABLE "drop table" ("delete from" text);',
    'ALTER TABLE "notes" ADD CONSTRAINT "c" CHECK ("status" in (\'a\', \'b\'));',
  ])('lets through what loses no data: %s', (sql) => {
    expect(deletions(sql)).toEqual([]);
  });

  it('names the line where each statement that deletes data begins', () => {
    const sql = [
      'CREATE TABLE "a" ("id" uuid);',
      '',
      'ALTER TABLE "notes"',
      '  DROP COLUMN "body";',
      'TRUNCATE "a";',
    ].join('\n');

    expect(deletions(sql)).toEqual([
      { line: 3, what: 'DROP COLUMN' },
      { line: 5, what: 'TRUNCATE' },
    ]);
  });
});

const keep = 'CREATE TABLE "notes" ("id" uuid PRIMARY KEY, "body" text);\n';
const loses = 'ALTER TABLE "notes" DROP COLUMN "body";\n';

function start(): Sandbox {
  const made = sandbox({ 'apps/notes-api/drizzle/0000_create_notes.sql': keep });
  repo(made);
  made.git('add', '.');
  made.commit('feat: create the notes');
  box = made;
  return made;
}

function run(made: Sandbox, env: Record<string, string> = {}) {
  return migrations
    .run({
      root: made.root,
      files: made.git('ls-files', '--cached', '--others', '--exclude-standard').split('\n'),
      env,
    })
    .map(
      (finding) => `${finding.level ?? 'error'} ${finding.path}:${finding.line} ${finding.message}`
    );
}

function pullRequest(made: Sandbox, labels: readonly string[]): Record<string, string> {
  const event = join(made.root, '.git', 'event.json');
  writeFileSync(
    event,
    JSON.stringify({ pull_request: { labels: labels.map((name) => ({ name })) } })
  );
  return { CI: 'true', GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: event };
}

function mergeCheckout(made: Sandbox, path: string, sql: string): void {
  made.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  made.git('switch', '-q', '-c', 'feature');
  made.write(path, sql);
  made.git('add', '.');
  made.commit('feat: change the notes');
  made.git('switch', '-q', 'main');
  made.git('merge', '-q', '--no-ff', '--no-edit', 'feature');
}

describe('the migrations rule on the laptop', () => {
  it('warns about a new migration that deletes data, and does not fail', () => {
    const made = start();
    made.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    made.write('apps/notes-api/drizzle/0001_drop_body.sql', loses);

    expect(run(made)).toEqual([
      'warning apps/notes-api/drizzle/0001_drop_body.sql:1 DROP COLUMN deletes data: the pull request waits for the owner, who adds the label destructive-migration',
    ]);
  });

  it('reads only the migrations that main does not have yet', () => {
    const made = start();
    made.write('apps/notes-api/drizzle/0001_drop_body.sql', loses);
    made.git('add', '.');
    made.commit('feat: drop the body');
    made.git('update-ref', 'refs/remotes/origin/main', 'HEAD');

    expect(run(made)).toEqual([]);
  });

  it('reads nothing when it cannot see main', () => {
    const made = start();
    made.write('apps/notes-api/drizzle/0001_drop_body.sql', loses);

    expect(run(made)).toEqual([]);
  });

  it('reads no SQL file outside a drizzle folder', () => {
    const made = start();
    made.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    made.write('scripts/cleanup.sql', loses);

    expect(run(made)).toEqual([]);
  });
});

describe('the migrations rule in a pull request', () => {
  it('fails on a migration that the pull request adds, when it deletes data', () => {
    const made = start();
    mergeCheckout(made, 'apps/notes-api/drizzle/0001_drop_body.sql', loses);

    expect(run(made, pullRequest(made, ['enhancement']))).toEqual([
      'error apps/notes-api/drizzle/0001_drop_body.sql:1 DROP COLUMN deletes data, so it waits for the owner, who adds the label destructive-migration to the pull request',
    ]);
  });

  it("passes on the owner's label, and says so", () => {
    const made = start();
    mergeCheckout(made, 'apps/notes-api/drizzle/0001_drop_body.sql', loses);

    expect(run(made, pullRequest(made, ['destructive-migration']))).toEqual([
      "warning apps/notes-api/drizzle/0001_drop_body.sql:1 DROP COLUMN deletes data, and the owner's label destructive-migration lets it through",
    ]);
  });

  it('passes a migration that loses no data, without the label', () => {
    const made = start();
    mergeCheckout(
      made,
      'apps/notes-api/drizzle/0001_add_pinned.sql',
      'ALTER TABLE "notes" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;\n'
    );

    expect(run(made, pullRequest(made, []))).toEqual([]);
  });

  it('reads nothing when the checkout is not the merge of a pull request', () => {
    const made = start();
    made.write('apps/notes-api/drizzle/0001_drop_body.sql', loses);
    made.git('add', '.');
    made.commit('feat: drop the body');

    expect(run(made, pullRequest(made, []))).toEqual([]);
  });

  it('counts the label as missing when the event cannot be read', () => {
    const made = start();
    mergeCheckout(made, 'apps/notes-api/drizzle/0001_drop_body.sql', loses);

    expect(
      run(made, {
        CI: 'true',
        GITHUB_EVENT_NAME: 'pull_request',
        GITHUB_EVENT_PATH: '/nothing.json',
      })
    ).toHaveLength(1);
    expect(run(made, { CI: 'true', GITHUB_EVENT_NAME: 'pull_request' })[0]).toMatch(/^error /);
  });
});
