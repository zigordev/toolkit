import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const repo = new URL('../../../', import.meta.url);

function read(path: string): string {
  return readFileSync(new URL(path, repo), 'utf8');
}

describe("the stories' browser", () => {
  const workflow = read('.github/workflows/check.yml');
  const image =
    /image: mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-([a-z]+)@sha256:[0-9a-f]{64}/.exec(
      workflow
    );

  it('comes from the official Playwright image, pinned by its digest', () => {
    expect(image).not.toBeNull();
  });

  it('is the Playwright version the workspace installs, so its browsers match', () => {
    const catalog = /^ {2}playwright: (\S+)$/m.exec(read('pnpm-workspace.yaml'));
    expect(image?.[1]).toBe(catalog?.[1]);
  });

  it('runs on the one Ubuntu that the pipeline and the host run', () => {
    expect(image?.[2]).toBe('resolute');
    expect(workflow).toContain('runs-on: ubuntu-26.04');
  });
});
