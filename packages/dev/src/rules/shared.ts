import type { Finding, Rule } from '../rule.ts';
import { compare, sharedFiles } from '../shared.ts';

const messages = {
  missing: 'the shared file is missing, so run "zigordev sync"',
  different: 'the file differs from the shared one, so run "zigordev sync"',
};

export function shared(source: string): Rule {
  return {
    name: 'shared',
    summary: 'every shared file matches the copy in @zigordev/dev',
    run({ root }) {
      const files = sharedFiles(source);
      if (files.length === 0) {
        return [{ rule: 'shared', path: source, message: 'the package holds no shared files' }];
      }
      const findings: Finding[] = [];
      for (const path of files) {
        const difference = compare(root, source, path);
        if (difference !== undefined) {
          findings.push({ rule: 'shared', path, message: messages[difference] });
        }
      }
      return findings;
    },
  };
}
