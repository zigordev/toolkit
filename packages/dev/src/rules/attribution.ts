import { attribution as pattern } from '../../commitlint.js';
import { exists, selection } from '../commits.ts';
import { git } from '../files.ts';
import type { Finding, Rule } from '../rule.ts';
import { changesOnlyTexts, withoutFinkLine } from '../translations.ts';
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

interface Commit {
  readonly hash: string;
  readonly author: string;
  readonly text: string;
}

function commitsOf(root: string, pullRequest: boolean): Commit[] {
  const chosen = exists(root, 'HEAD') ? selection(root, pullRequest) : undefined;
  if (chosen === undefined) {
    return [];
  }
  const log = git(root, ['log', '--format=%h%x09%an <%ae>%x09%B%x00', ...chosen]) ?? '';
  return log
    .split('\0')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
    .map((entry) => {
      const [hash = '', author = '', ...text] = entry.split('\t');
      return { hash, author, text: text.join('\t') };
    });
}

function commits(root: string, chosen: readonly Commit[]): Finding[] {
  const findings: Finding[] = [];
  for (const { hash, author, text } of chosen) {
    const own = ownText(author, text);
    const checked = changesOnlyTexts(root, hash) ? withoutFinkLine(own) : own;
    if (pattern.test(checked)) {
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
    const chosen = commitsOf(root, env.GITHUB_EVENT_NAME === 'pull_request');
    const onlyTexts = chosen.length > 0 && chosen.every(({ hash }) => changesOnlyTexts(root, hash));
    const texts = [
      ['the pull request title', env.PR_TITLE],
      ['the pull request description', env.PR_BODY],
    ] as const;
    for (const [path, text] of texts) {
      const checked = onlyTexts ? withoutFinkLine(text ?? '') : (text ?? '');
      if (pattern.test(checked)) {
        findings.push({ rule: 'attribution', path, message });
      }
    }
    return [...findings, ...commits(root, chosen)];
  },
};
