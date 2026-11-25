import { git } from './files.ts';

export const finkLine = 'Co-authored-by: Fink <hello@inlang.com>';

const translationFile = /(^|\/)messages\/[a-z]{2}\.json$/;

export function changedFiles(root: string, hash: string): string[] {
  const listed =
    git(root, ['diff-tree', '--no-commit-id', '--name-only', '-r', '--root', hash]) ?? '';
  return listed.split('\n').filter((path) => path !== '');
}

export function changesOnlyTexts(root: string, hash: string): boolean {
  const files = changedFiles(root, hash);
  return files.length > 0 && files.every((path) => translationFile.test(path));
}

export function withoutFinkLine(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trimEnd() !== finkLine)
    .join('\n');
}
