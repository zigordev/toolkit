import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Finding, Rule } from '../rule.ts';

const link = /!?\[[^\]]*\]\(([^)\s]+)[^)]*\)/g;
const scheme = /^[a-z][a-z0-9+.-]*:/i;
const fence = /^ {0,3}(```|~~~)/;
const codeSpan = /`[^`]*`/g;

function targetsOf(line: string): string[] {
  return [...line.replace(codeSpan, '').matchAll(link)].map((match) => match[1] ?? '');
}

function resolves(root: string, file: string, target: string): boolean {
  const path = decodeURIComponent(target.split('#')[0]?.split('?')[0] ?? '');
  if (path === '') {
    return true;
  }
  const base = path.startsWith('/') ? root : join(root, dirname(file));
  return existsSync(join(base, path));
}

function check(root: string, file: string): Finding[] {
  const findings: Finding[] = [];
  let fenced = false;
  readFileSync(join(root, file), 'utf8')
    .split('\n')
    .forEach((line, index) => {
      if (fence.test(line)) {
        fenced = !fenced;
        return;
      }
      if (fenced) {
        return;
      }
      for (const target of targetsOf(line)) {
        if (scheme.test(target) || target.startsWith('//') || resolves(root, file, target)) {
          continue;
        }
        findings.push({
          rule: 'links',
          path: file,
          line: index + 1,
          message: `the link to "${target}" leads nowhere`,
        });
      }
    });
  return findings;
}

export const links: Rule = {
  name: 'links',
  summary: 'every link between docs leads to a file',
  run({ root, files }) {
    return files.filter((file) => file.endsWith('.md')).flatMap((file) => check(root, file));
  },
};
