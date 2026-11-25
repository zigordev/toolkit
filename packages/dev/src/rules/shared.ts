import type { Finding, Rule } from '../rule.ts';
import { compare, compareLink, copiedFiles, sharedFiles, sharedFolders } from '../shared.ts';

const messages = {
  missing: 'the shared file is missing, so run "zigordev sync"',
  different: 'the file differs from the shared one, so run "zigordev sync"',
};

const linkMessages = {
  missing: 'the link to the shared folder is missing, so run "zigordev sync"',
  copied: 'the folder holds copies instead of a link to the shared one, so run "zigordev sync"',
  elsewhere: 'the link leads elsewhere than the shared folder, so run "zigordev sync"',
};

export function shared(source: string): Rule {
  return {
    name: 'shared',
    summary:
      'the shared rules and skills are links to @zigordev/dev, and every other shared file matches its copy there',
    run({ root }) {
      if (sharedFiles(source).length === 0) {
        return [{ rule: 'shared', path: source, message: 'the package holds no shared files' }];
      }
      const findings: Finding[] = [];
      for (const folder of sharedFolders(source)) {
        let difference: ReturnType<typeof compareLink>;
        try {
          difference = compareLink(root, source, folder);
        } catch (error) {
          return [{ rule: 'shared', path: source, message: (error as Error).message }];
        }
        if (difference !== undefined) {
          findings.push({ rule: 'shared', path: folder, message: linkMessages[difference] });
        }
      }
      for (const path of copiedFiles(source)) {
        const difference = compare(root, source, path);
        if (difference !== undefined) {
          findings.push({ rule: 'shared', path, message: messages[difference] });
        }
      }
      return findings;
    },
  };
}
