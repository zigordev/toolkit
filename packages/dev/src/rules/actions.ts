import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Finding, Rule } from '../rule.ts';

const uses = /^\s*(?:-\s*)?uses:\s*["']?([^"'\s#]+)["']?\s*(?:#\s*(.*))?$/;
const commit = /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/;
const digest = /^docker:\/\/\S+@sha256:[0-9a-f]{64}$/;
const version = /^v?\d+\.\d+\.\d+\S*$/;

function isWorkflow(path: string): boolean {
  const name = basename(path);
  return (
    /(?:^|\/)\.github\/workflows\/[^/]+\.ya?ml$/.test(path) ||
    name === 'action.yml' ||
    name === 'action.yaml'
  );
}

function problem(reference: string, label: string | undefined): string | undefined {
  if (reference.startsWith('./') || reference.startsWith('$/')) {
    return undefined;
  }
  if (reference.startsWith('docker://')) {
    return digest.test(reference) ? undefined : 'is not pinned to a digest';
  }
  if (!commit.test(reference)) {
    return 'is not pinned to a commit';
  }
  if (label === undefined || !version.test(label.trim())) {
    return 'has no exact version after it, such as "# v1.2.3"';
  }
  return undefined;
}

function check(root: string, file: string): Finding[] {
  const findings: Finding[] = [];
  readFileSync(join(root, file), 'utf8')
    .split('\n')
    .forEach((line, index) => {
      const match = uses.exec(line);
      const reference = match?.[1];
      if (reference === undefined) {
        return;
      }
      const message = problem(reference, match?.[2]);
      if (message !== undefined) {
        findings.push({
          rule: 'actions',
          path: file,
          line: index + 1,
          message: `the action "${reference}" ${message}`,
        });
      }
    });
  return findings;
}

export const actions: Rule = {
  name: 'actions',
  summary: 'every action is pinned to a commit, with its version beside it',
  run({ root, files }) {
    return files.filter(isWorkflow).flatMap((file) => check(root, file));
  },
};
