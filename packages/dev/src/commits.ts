import { git } from './files.ts';

export function exists(root: string, revision: string): boolean {
  return git(root, ['rev-parse', '--verify', '--quiet', `${revision}^{commit}`]) !== undefined;
}

export function selection(root: string, pullRequest: boolean): string[] | undefined {
  if (pullRequest) {
    return exists(root, 'HEAD^2') ? ['HEAD^1..HEAD^2'] : undefined;
  }
  if (
    exists(root, 'origin/main') &&
    git(root, ['rev-list', '--count', 'origin/main..HEAD']) !== '0'
  ) {
    return ['origin/main..HEAD'];
  }
  return ['-1', 'HEAD'];
}
