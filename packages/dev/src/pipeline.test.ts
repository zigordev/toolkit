import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const workflow = read('../../../.github/workflows/check.yml');
const release = read('../../../.github/workflows/release.yml');
const publish = read('../../../.github/workflows/publish.yml');
const deploy = read('../../../.github/workflows/deploy.yml');
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

function permissions(block: string): string[] {
  const listed = /^ {4}permissions:\n((?: {6}.+\n)+)/m.exec(block)?.[1] ?? '';
  return listed
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

function scripts(text: string): string[] {
  const lines = text.split('\n');
  return lines.flatMap((line, index) => {
    const found = /^( +)(?:- )?run: (.*)$/.exec(line);
    if (found === null) {
      return [];
    }
    if (found[2] !== '|') {
      return [found[2] ?? ''];
    }
    const indent = found[1]?.length ?? 0;
    const end = lines.findIndex(
      (next, after) => after > index && next.trim() !== '' && next.search(/\S/) <= indent
    );
    return [lines.slice(index + 1, end === -1 ? undefined : end).join('\n')];
  });
}

function setting(name: string): string | undefined {
  return new RegExp(`^ +${name}: (.+)$`, 'm').exec(workflow)?.[1];
}

describe('the machines of the pipeline', () => {
  const ubuntu = 'ubuntu-26.04';
  const files = {
    'check.yml': workflow,
    'release.yml': release,
    'publish.yml': publish,
    'deploy.yml': deploy,
    'ci.yml': caller,
  };
  const arm = new Set(['contract', 'image']);

  it('reads every job of the five workflows', () => {
    expect(jobs(workflow)).toEqual(['quality', 'contract', 'title', 'dependencies', 'scan']);
    expect(jobs(release)).toEqual(['version', 'pack', 'publish']);
    expect(jobs(publish)).toEqual(['plan', 'image']);
    expect(jobs(deploy)).toEqual(['deploy']);
    expect(jobs(caller)).toEqual(['pipeline', 'check', 'release']);
  });

  it('name Ubuntu 26.04 exactly on every job, or call a workflow of this repo that does', () => {
    const wrong = Object.entries(files).flatMap(([file, text]) =>
      jobs(text).flatMap((name) => {
        const block = job(text, name);
        const label = /^ {4}runs-on: (.+)$/m.exec(block)?.[1];
        const calls = /^ {4}uses: \S*\.github\/workflows\/[\w-]+\.yml$/m.test(block);
        const named = arm.has(name) ? `${ubuntu}-arm` : ubuntu;
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

  it('hand every value of an expression to a script through env, never inside the script', () => {
    const inline = Object.entries(files).flatMap(([file, text]) =>
      scripts(text)
        .filter((script) => script.includes('${{'))
        .map((script) => `${file}: ${script.trim().split('\n')[0]}`)
    );

    expect(scripts(deploy).length).toBeGreaterThan(2);
    expect(inline).toEqual([]);
  });
});

describe('the publish workflow', () => {
  it('is called with the folder of a product, the repo itself by default', () => {
    expect(publish).toMatch(
      /^ {2}workflow_call:\n {4}inputs:\n {6}product-folder:\n {8}description: .+\n {8}type: string\n {8}default: "\."\n/m
    );
  });

  it('builds each app in a job of its own, on an arm64 machine', () => {
    expect(job(publish, 'image')).toContain('    runs-on: ubuntu-26.04-arm\n');
    expect(job(publish, 'image')).toContain(
      `        include: \${{ fromJSON(needs.plan.outputs.apps) }}\n`
    );
  });

  it('lets the plan only read, and only the image job push and sign', () => {
    expect(permissions(job(publish, 'plan'))).toEqual(['contents: read']);
    expect(permissions(job(publish, 'image'))).toEqual([
      'contents: read',
      'packages: write',
      'id-token: write',
      'attestations: write',
    ]);
  });

  it("attests each image into the registry with GitHub's own action, with no storage record, which only an organisation can keep", () => {
    expect(job(publish, 'image')).toMatch(
      / {8}uses: actions\/attest@[0-9a-f]{40} # v\d+\.\d+\.\d+\n {8}with:\n {10}subject-name: \$\{\{ steps\.build\.outputs\.image \}\}\n {10}subject-digest: \$\{\{ steps\.build\.outputs\.digest \}\}\n {10}push-to-registry: true\n {10}create-storage-record: false\n/
    );
  });

  it('signs out of GHCR at the end, also after a failure', () => {
    expect(job(publish, 'image')).toMatch(
      / {6}- name: Sign out of GHCR\n {8}if: always\(\)\n {8}run: docker logout ghcr\.io\n$/
    );
  });

  it('installs no dependency in the job that can push and sign', () => {
    expect(job(publish, 'image')).not.toMatch(/pnpm|npm |mise/);
  });
});

describe('the deploy workflow', () => {
  it('takes a target, a folder and an address to ask, and the number of the AWS account as a secret', () => {
    expect(deploy).toMatch(
      / {6}target:\n {8}description: .+\n {8}type: string\n {8}required: true\n/
    );
    expect(deploy).toMatch(
      / {6}compose-dir:\n {8}description: .+\n {8}type: string\n {8}default: "\."\n/
    );
    expect(deploy).toMatch(
      / {6}health-url:\n {8}description: .+\n {8}type: string\n {8}default: ""\n/
    );
    expect(deploy).toMatch(
      / {4}secrets:\n {6}AWS_ACCOUNT_ID:\n {8}description: .+\n {8}required: true\n/
    );
  });

  it('runs in the environment production, one deploy per target at a time, and never cancels one', () => {
    const block = job(deploy, 'deploy');

    expect(block).toContain('    environment: production\n');
    expect(block).toContain(
      `    concurrency:\n      group: deploy-\${{ inputs.target }}\n      cancel-in-progress: false\n`
    );
  });

  it('may read the repo and its build records, and ask for the proof that AWS trusts, and nothing more', () => {
    expect(permissions(job(deploy, 'deploy'))).toEqual([
      'contents: read',
      'id-token: write',
      'attestations: read',
    ]);
  });

  it("signs in with the target's own role, whose address takes the account's number from the secret, and hides that number", () => {
    expect(deploy).toMatch(
      / {8}uses: aws-actions\/configure-aws-credentials@[0-9a-f]{40} # v\d+\.\d+\.\d+\n {8}with:\n {10}role-to-assume: arn:aws:iam::\$\{\{ secrets\.AWS_ACCOUNT_ID \}\}:role\/platform-deploy-\$\{\{ inputs\.target \}\}\n {10}role-session-name: .+\n {10}aws-region: eu-west-1\n {10}mask-aws-account-id: true\n/
    );
  });

  it('verifies every build record before it signs in to AWS', () => {
    expect(deploy.indexOf('gh attestation verify')).toBeGreaterThan(0);
    expect(deploy.indexOf('gh attestation verify')).toBeLessThan(
      deploy.indexOf('configure-aws-credentials')
    );
  });

  it('installs no dependency in the job that can deploy', () => {
    expect(job(deploy, 'deploy')).not.toMatch(/pnpm|npm |mise/);
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
      'docker compose --file compose.yaml --file compose.local.yaml build && POSTGRES_PASSWORD=contract-only TEMPLATE_API_DATABASE_PASSWORD=contract-only zigordev contract'
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
