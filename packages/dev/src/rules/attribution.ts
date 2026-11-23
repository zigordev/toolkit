import { attribution as pattern } from '../../commitlint.js';
import { exists, selection } from '../commits.ts';
import { git } from '../files.ts';
import type { Finding, Rule } from '../rule.ts';
import { renovate } from './identity.ts';

const message = 'the text carries an attribution line, so remove it';
const addedByGithub = `Co-authored-by: ${renovate}`;

function ownText(author: string, text: string): string {
  if (author !== renovate) {
    return text;
  }
  return text
    .split('\n')
    .filter((line) => line.trimEnd() !== addedByGithub)
    .join('\n');
}

function commits(root: string, pullRequest: boolean): Finding[] {
  const chosen = exists(root, 'HEAD') ? selection(root, pullRequest) : undefined;
  if (chosen === undefined) {
    return [];
  }
  const log = git(root, ['log', '--format=%h%x09%an <%ae>%x09%B%x00', ...chosen]) ?? '';
  const findings: Finding[] = [];
  for (const entry of log.split('\0')) {
    const [hash = '', author = '', ...text] = entry.trim().split('\t');
    if (pattern.test(ownText(author, text.join('\t')))) {
      findings.push({ rule: 'attribution', path: `commit ${hash}`, message });
    }
  }
  return findings;
}

export const attribution: Rule = {
  name: 'attribution',
  summary: 'no commit and no pull request text credits a tool or a co-author',
  run({ root, env }) {
    const findings: Finding[] = [];
    const texts = [
      ['the pull request title', env.PR_TITLE],
      ['the pull request description', env.PR_BODY],
    ] as const;
    for (const [path, text] of texts) {
      if (pattern.test(text ?? '')) {
        findings.push({ rule: 'attribution', path, message });
      }
    }
    return [...findings, ...commits(root, env.GITHUB_EVENT_NAME === 'pull_request')];
  },
};
