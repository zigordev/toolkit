import { exists, selection } from '../commits.ts';
import { git } from '../files.ts';
import type { Finding, Rule } from '../rule.ts';

export const owner = 'zigordev <zigordev@gmail.com>';
export const renovate = 'renovate[bot] <29139614+renovate[bot]@users.noreply.github.com>';
const github = 'GitHub <noreply@github.com>';
const authors = new Set([owner, renovate]);
const committers = new Set([owner, renovate, github]);

function configured(root: string): Finding[] {
  const current = `${git(root, ['config', 'user.name']) ?? ''} <${git(root, ['config', 'user.email']) ?? ''}>`;
  if (current === owner) {
    return [];
  }
  return [
    {
      rule: 'identity',
      path: '.git/config',
      message: `a commit here would be made as "${current}", not as "${owner}"`,
    },
  ];
}

function commits(root: string, pullRequest: boolean): Finding[] {
  const chosen = selection(root, pullRequest);
  if (chosen === undefined) {
    return [
      {
        rule: 'identity',
        path: 'HEAD',
        message: "the pull request's commits are not in this checkout, so fetch the full history",
      },
    ];
  }
  const log = git(root, ['log', '--format=%h%x09%an <%ae>%x09%cn <%ce>', ...chosen]) ?? '';
  const findings: Finding[] = [];
  for (const entry of log.split('\n').filter((line) => line !== '')) {
    const [hash = '', author = '', committer = ''] = entry.split('\t');
    if (!authors.has(author)) {
      findings.push({
        rule: 'identity',
        path: `commit ${hash}`,
        message: `the author is "${author}", not "${owner}"`,
      });
    }
    if (!committers.has(committer)) {
      findings.push({
        rule: 'identity',
        path: `commit ${hash}`,
        message: `the committer is "${committer}", not "${owner}"`,
      });
    }
  }
  return findings;
}

export const identity: Rule = {
  name: 'identity',
  summary: 'every commit is made as zigordev',
  run({ root, env }) {
    if (!exists(root, 'HEAD')) {
      return env.CI === undefined ? configured(root) : [];
    }
    const history = commits(root, env.GITHUB_EVENT_NAME === 'pull_request');
    return env.CI === undefined ? [...configured(root), ...history] : history;
  },
};
