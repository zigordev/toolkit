import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exists } from '../commits.ts';
import { git } from '../files.ts';
import type { Finding, Rule } from '../rule.ts';

export const approval = 'destructive-migration';

const migration = /(^|\/)drizzle\/[^/]+\.sql$/;

export interface Deletion {
  readonly line: number;
  readonly what: string;
}

function blank(sql: string): string {
  return sql.replace(/'(?:[^']|'')*'|"(?:[^"]|"")*"/g, (quoted) => quoted.replace(/[^\n]/g, 'x'));
}

function actions(statement: string): string[] {
  const found: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < statement.length; index += 1) {
    const char = statement[index];
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
    } else if (char === ',' && depth === 0) {
      found.push(statement.slice(start, index).trim());
      start = index + 1;
    }
  }
  found.push(statement.slice(start).trim());
  return found;
}

function deletionIn(statement: string): string | undefined {
  const words = statement.replace(/\s+/g, ' ').trim().toUpperCase();
  const dropped = /^DROP (TABLE|SCHEMA|DATABASE)\b/.exec(words);
  if (dropped !== null) {
    return `DROP ${dropped[1]}`;
  }
  if (/^TRUNCATE\b/.test(words)) {
    return 'TRUNCATE';
  }
  if (/^DELETE\b/.test(words)) {
    return 'DELETE FROM';
  }
  const altered = /^ALTER TABLE (?:IF EXISTS )?(?:ONLY )?\S+ (.*)$/.exec(words);
  if (altered === null) {
    return undefined;
  }
  for (const action of actions(altered[1] ?? '')) {
    if (/^DROP (?!CONSTRAINT\b)/.test(action)) {
      return 'DROP COLUMN';
    }
    if (/^ALTER (?:COLUMN )?\S+ (?:SET DATA )?TYPE\b/.test(action)) {
      return 'a change of type';
    }
  }
  return undefined;
}

export function deletions(sql: string): Deletion[] {
  const text = blank(sql);
  const found: Deletion[] = [];
  let offset = 0;
  for (const statement of text.split(';')) {
    const leading = statement.length - statement.trimStart().length;
    const what = deletionIn(statement);
    if (what !== undefined) {
      found.push({ line: text.slice(0, offset + leading).split('\n').length, what });
    }
    offset += statement.length + 1;
  }
  return found;
}

function added(root: string, files: readonly string[], pullRequest: boolean): string[] | undefined {
  if (pullRequest) {
    if (!exists(root, 'HEAD^1') || !exists(root, 'HEAD^2')) {
      return undefined;
    }
    const listed = git(root, ['diff', '--name-only', '--diff-filter=A', 'HEAD^1', 'HEAD']) ?? '';
    return listed.split('\n').filter((path) => migration.test(path));
  }
  if (!exists(root, 'origin/main')) {
    return [];
  }
  return files.filter(
    (path) =>
      migration.test(path) && git(root, ['cat-file', '-e', `origin/main:${path}`]) === undefined
  );
}

function labels(path: string | undefined): string[] {
  try {
    const event = JSON.parse(readFileSync(path ?? '', 'utf8')) as {
      readonly pull_request?: { readonly labels?: readonly { readonly name?: string }[] };
    };
    return (event.pull_request?.labels ?? []).map((label) => label.name ?? '');
  } catch {
    return [];
  }
}

function message(what: string, pullRequest: boolean, approved: boolean): string {
  if (approved) {
    return `${what} deletes data, and the owner's label ${approval} lets it through`;
  }
  return pullRequest
    ? `${what} deletes data, so it waits for the owner, who adds the label ${approval} to the pull request`
    : `${what} deletes data: the pull request waits for the owner, who adds the label ${approval}`;
}

export const migrations: Rule = {
  name: 'migrations',
  summary: `a migration that deletes data waits for the owner's label ${approval}`,
  run({ root, files, env }) {
    const pullRequest = env.GITHUB_EVENT_NAME === 'pull_request';
    const approved = pullRequest && labels(env.GITHUB_EVENT_PATH).includes(approval);
    const paths = added(root, files, pullRequest);
    if (paths === undefined) {
      return [
        {
          rule: 'migrations',
          path: '.git',
          message:
            'in a pull request this rule needs the merge commit with its two parents and the whole history: check out the merge of the pull request with fetch-depth 0',
        },
      ];
    }
    return paths.flatMap((path) =>
      deletions(readFileSync(join(root, path), 'utf8')).map(
        (deletion): Finding => ({
          rule: 'migrations',
          path,
          line: deletion.line,
          message: message(deletion.what, pullRequest, approved),
          ...(pullRequest && !approved ? {} : { level: 'warning' }),
        })
      )
    );
  },
};
