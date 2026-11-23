import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const workflow = read('../../../.github/workflows/check.yml');
const release = read('../../../.github/workflows/release.yml');
const caller = read('../../../.github/workflows/ci.yml');
const template = JSON.parse(read('../../../template/package.json')) as {
  readonly scripts: Readonly<Record<string, string>>;
};

function job(text: string, name: string): string {
  const rest = text.slice(text.indexOf(`\n  ${name}:\n`) + 1);
  const next = /\n {2}\w[\w-]*:\n/.exec(rest);
  return next === null ? rest : rest.slice(0, next.index + 1);
}

function jobs(text: string): string[] {
  const body = text.slice(text.indexOf('\njobs:\n'));
  return [...body.matchAll(/^ {2}([\w-]+):$/gm)].map((match) => match[1] ?? '');
}

function setting(name: string): string | undefined {
  return new RegExp(`^ +${name}: (.+)$`, 'm').exec(workflow)?.[1];
}

describe('the machines of the pipeline', () => {
  const ubuntu = 'ubuntu-26.04';
  const files = { 'check.yml': workflow, 'release.yml': release, 'ci.yml': caller };

  it('reads every job of the three workflows', () => {
    expect(jobs(workflow)).toEqual(['quality', 'contract', 'title', 'dependencies', 'scan']);
    expect(jobs(release)).toEqual(['version', 'pack', 'publish']);
    expect(jobs(caller)).toEqual(['pipeline', 'check', 'release']);
  });

  it('name Ubuntu 26.04 exactly on every job, or call a workflow of this repo that does', () => {
    const wrong = Object.entries(files).flatMap(([file, text]) =>
      jobs(text).flatMap((name) => {
        const block = job(text, name);
        const label = /^ {4}runs-on: (.+)$/m.exec(block)?.[1];
        const calls = /^ {4}uses: \S*\.github\/workflows\/[\w-]+\.yml$/m.test(block);
        const named = name === 'contract' ? `${ubuntu}-arm` : ubuntu;
        const right = label === undefined ? calls : label === named;
        return right ? [] : [`${file}: the job ${name} runs on ${label ?? 'no named machine'}`];
      })
    );

    expect(wrong).toEqual([]);
  });

  it('never name a machine that GitHub moves by itself', () => {
    for (const text of Object.values(files)) {
      expect(text).not.toMatch(/runs-on: \S*latest/);
    }
  });
});

describe('the Dependencies job', () => {
  it('fails on a known flaw of any severity', () => {
    expect(setting('fail-on-severity')).toBe('low');
  });
});

describe('the Contract job', () => {
  it('runs only for a repo that names the folder of a product', () => {
    expect(workflow).toContain('      product-folder:\n');
    expect(workflow).toContain('        type: string\n        default: ""\n');
    expect(job(workflow, 'contract')).toContain("if: inputs.product-folder != ''");
  });

  it('runs on an arm64 machine, because the images are built for arm64 only', () => {
    expect(job(workflow, 'contract')).toContain('runs-on: ubuntu-26.04-arm');
  });

  it('may read the repo, and nothing else', () => {
    expect(job(workflow, 'contract')).toContain('    permissions:\n      contents: read\n');
    expect(job(workflow, 'contract')).not.toContain('write');
    expect(job(workflow, 'contract')).toContain('persist-credentials: false');
  });

  it('runs the script check:contract in that folder, and takes the folder as a variable', () => {
    const steps = job(workflow, 'contract');

    expect(steps).toMatch(/^ {10}PRODUCT_FOLDER: \$\{\{ inputs\.product-folder \}\}$/m);
    expect(steps).toContain('        run: pnpm --dir "$PRODUCT_FOLDER" run check:contract\n');
    expect(steps.match(/inputs\.product-folder/g)).toHaveLength(2);
  });

  it('sits behind the same gate as every other job', () => {
    expect(job(caller, 'check')).toContain('needs: [pipeline]');
    expect(job(caller, 'check')).toContain('test "$RESULT" = "success"');
  });

  it('is asked for by this repo, for the product template', () => {
    expect(job(caller, 'pipeline')).toContain('    with:\n      product-folder: template\n');
  });

  it('finds, in the template, the script that builds the images and holds them to the contract', () => {
    expect(template.scripts['check:contract']).toBe(
      'docker compose --file compose.yaml --file compose.local.yaml build && zigordev contract'
    );
  });
});

describe('the release', () => {
  it('runs after the gate, and only on a push to main', () => {
    expect(job(caller, 'release')).toContain('needs: [check]');
    expect(job(caller, 'release')).toContain("if: github.event_name == 'push'");
  });

  it('lets only the Version job write to the repo', () => {
    expect(job(release, 'version')).toContain('contents: write');
    expect(job(release, 'pack')).not.toContain('write');
    expect(job(release, 'publish')).not.toContain('contents: write');
  });

  it('lets only the Publish job ask for the proof npm trusts, in the environment named release', () => {
    expect(job(release, 'publish')).toContain('id-token: write');
    expect(job(release, 'publish')).toContain('environment: release');
    expect(job(release, 'version')).not.toContain('id-token');
    expect(job(release, 'pack')).not.toContain('id-token');
  });

  it('installs no dependency in the job that can publish', () => {
    expect(job(release, 'publish')).not.toContain('pnpm');
  });

  it('hands npm each tarball as a path, which npm would otherwise read as a repo on GitHub', () => {
    expect(job(release, 'publish')).toContain('for tarball in ./out/*.tgz; do');
  });

  it('gives npm seven minutes to show a version that an earlier run handed in', () => {
    expect(job(release, 'version')).toContain('zigordev release plan --settle 420');
  });

  it('tags nothing while no package is public', () => {
    expect(job(release, 'version')).toContain("if: steps.packages.outputs.public != '0'");
  });
});
