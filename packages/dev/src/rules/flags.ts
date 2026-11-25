import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Finding, Rule } from '../rule.ts';

const flagsFile = /(^|\/)flags\.json$/;
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export interface FlagProblem {
  readonly flag?: string;
  readonly message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRealDate(text: string): boolean {
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(text);
}

export function today(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function flagProblems(text: string, day: string): FlagProblem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [{ message: 'the file is not JSON' }];
  }
  const flags = isRecord(parsed) ? parsed.flags : undefined;
  if (!isRecord(flags)) {
    return [{ message: 'the file has no "flags" object' }];
  }
  return Object.entries(flags).flatMap(([flag, definition]): FlagProblem[] => {
    const metadata = isRecord(definition) ? definition.metadata : undefined;
    const removeBy = isRecord(metadata) ? metadata.removeBy : undefined;
    if (typeof removeBy !== 'string' || !isoDate.test(removeBy) || !isRealDate(removeBy)) {
      return [
        {
          flag,
          message: `the flag "${flag}" has no removal date: give it "metadata": { "removeBy": "YYYY-MM-DD" }`,
        },
      ];
    }
    if (removeBy < day) {
      return [
        {
          flag,
          message: `the flag "${flag}" passed its removal date, ${removeBy}: remove the flag and the code that asks for it, or move the date in a pull request that says why`,
        },
      ];
    }
    return [];
  });
}

function lineOf(text: string, flag: string | undefined): number | undefined {
  if (flag === undefined) {
    return undefined;
  }
  const index = text.split('\n').findIndex((line) => line.includes(`${JSON.stringify(flag)}:`));
  return index === -1 ? undefined : index + 1;
}

export const flags: Rule = {
  name: 'flags',
  summary: 'every feature flag carries a removal date, and none has passed it',
  run({ root, files }) {
    const day = today();
    return files
      .filter((path) => flagsFile.test(path))
      .flatMap((path) => {
        const text = readFileSync(join(root, path), 'utf8');
        return flagProblems(text, day).map((problem): Finding => {
          const line = lineOf(text, problem.flag);
          return {
            rule: 'flags',
            path,
            ...(line === undefined ? {} : { line }),
            message: problem.message,
          };
        });
      });
  },
};
