import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Finding, Rule } from '../rule.ts';

const files = [
  'README.md',
  'docs/local-first-start.md',
  'docs/cloud-first-deploy.md',
  'docs/user-manual.md',
];
const records = 'docs/adr';

function hasRecord(folder: string): boolean {
  return (
    existsSync(folder) &&
    statSync(folder).isDirectory() &&
    readdirSync(folder).some((name) => name.endsWith('.md'))
  );
}

export const docs: Rule = {
  name: 'docs',
  summary: 'the five standard docs exist',
  run({ root }) {
    const findings: Finding[] = files
      .filter((path) => !existsSync(join(root, path)))
      .map((path) => ({ rule: 'docs', path, message: 'the file is missing' }));
    if (!hasRecord(join(root, records))) {
      findings.push({
        rule: 'docs',
        path: records,
        message: 'the folder holds no decision record',
      });
    }
    return findings;
  },
};
