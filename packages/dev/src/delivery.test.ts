import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { type Call, runStep, type StepRun, stepScript } from '../test/workflow.ts';

const root = fileURLToPath(new URL('../../..', import.meta.url)).replace(/\/$/, '');
const publish = readFileSync(join(root, '.github/workflows/publish.yml'), 'utf8');
const deploy = readFileSync(join(root, '.github/workflows/deploy.yml'), 'utf8');

const commit = '1f3a9c2e8b7d6a5f4e3d2c1b0a9f8e7d6c5b4a39';
const previous = '0e2d4c6b8a0f1e3d5c7b9a1f3e5d7c9b1a3f5e70';
const newer = '9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b';
const apiDigest = `sha256:${'a'.repeat(64)}`;
const webDigest = `sha256:${'b'.repeat(64)}`;
const repository = 'zigordev/gpool';

const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) {
    rmSync(folder, { recursive: true, force: true });
  }
});

function product(files: Readonly<Record<string, string>>): string {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), 'zigordev-product-')));
  folders.push(folder);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(folder, path, '..'), { recursive: true });
    writeFileSync(join(folder, path), content);
  }
  return folder;
}

function calls(ran: StepRun, tool: string, action?: string): Call[] {
  return ran.calls.filter(
    (call) => call.tool === tool && (action === undefined || call.args.includes(action))
  );
}

function said(ran: StepRun): string {
  return `${ran.stdout}\n${ran.stderr}`;
}

describe('the publish workflow', () => {
  const plan = stepScript(publish, 'List the apps that the product builds');
  const build = stepScript(
    publish,
    'Build the image for arm64, and push it under its commit and as main'
  );
  const onMain = { GITHUB_REF: 'refs/heads/main', GITHUB_WORKSPACE: root };

  it('lists each app that compose.local.yaml builds, once, with its build folder and Dockerfile', () => {
    const ran = runStep(plan, { cwd: root, env: { ...onMain, PRODUCT_FOLDER: 'template' } });

    expect(ran.code, said(ran)).toBe(0);
    expect(JSON.parse(ran.outputs.apps ?? '')).toEqual([
      { app: 'template-api', context: '.', dockerfile: 'template/apps/template-api/Dockerfile' },
      { app: 'template-web', context: '.', dockerfile: 'template/apps/template-web/Dockerfile' },
    ]);
    expect(ran.summary).toContain('| `template-web` | `./template/apps/template-web/Dockerfile` |');
  });

  it('publishes from main only', () => {
    const ran = runStep(plan, {
      cwd: root,
      env: { ...onMain, GITHUB_REF: 'refs/heads/feat/try', PRODUCT_FOLDER: 'template' },
    });

    expect(ran.code).toBe(1);
    expect(ran.stdout).toContain('::error::Images are published from main only');
    expect(ran.outputs.apps).toBeUndefined();
  });

  it('stops when the product builds no image of ours', () => {
    const folder = product({
      'compose.yaml': 'name: lone\nservices:\n  lone-db:\n    image: postgres:18.7-alpine3.24\n',
      'compose.local.yaml':
        'services:\n  lone-db:\n    environment:\n      POSTGRES_PASSWORD: local-only\n',
    });

    const ran = runStep(plan, {
      cwd: folder,
      env: { ...onMain, GITHUB_WORKSPACE: folder, PRODUCT_FOLDER: '.' },
    });

    expect(ran.code).toBe(1);
    expect(ran.stdout).toContain('builds no image of ghcr.io/zigordev/');
  });

  it('stops when an app is built from a folder outside the repo', () => {
    const folder = product({
      'repo/compose.yaml': `name: away\nservices:\n  away-api:\n    image: ghcr.io/zigordev/away-api:\${VERSION:-local}\n`,
      'repo/compose.local.yaml': 'services:\n  away-api:\n    build:\n      context: ..\n',
    });

    const ran = runStep(plan, {
      cwd: join(folder, 'repo'),
      env: { ...onMain, GITHUB_WORKSPACE: join(folder, 'repo'), PRODUCT_FOLDER: '.' },
    });

    expect(ran.code).not.toBe(0);
    expect(said(ran)).toContain('the build context of away-api lies outside the repo');
    expect(ran.outputs.apps).toBeUndefined();
  });

  it('stops when an app is not named in lowercase letters, digits and dashes', () => {
    const folder = product({
      'compose.yaml': `name: odd\nservices:\n  odd-api:\n    image: ghcr.io/zigordev/odd_api:\${VERSION:-local}\n`,
      'compose.local.yaml': 'services:\n  odd-api:\n    build:\n      context: .\n',
    });

    const ran = runStep(plan, {
      cwd: folder,
      env: { ...onMain, GITHUB_WORKSPACE: folder, PRODUCT_FOLDER: '.' },
    });

    expect(ran.code).toBe(1);
    expect(ran.stdout).toContain('these are not: odd_api');
  });

  const app = {
    APP: 'template-api',
    CONTEXT: '.',
    DOCKERFILE: 'template/apps/template-api/Dockerfile',
    GITHUB_SHA: commit,
    GITHUB_SERVER_URL: 'https://github.com',
    GITHUB_REPOSITORY: repository,
  };

  it('builds for arm64 with no build record of its own, labels the source, pushes under the commit and as main, and names the digest', () => {
    const ran = runStep(build, {
      cwd: root,
      env: app,
      scenario: { digests: { [`ghcr.io/zigordev/template-api:${commit}`]: apiDigest } },
    });

    expect(ran.code, said(ran)).toBe(0);
    expect(ran.outputs).toEqual({ image: 'ghcr.io/zigordev/template-api', digest: apiDigest });
    expect(calls(ran, 'docker', 'build').map((call) => call.args)).toEqual([
      [
        'buildx',
        'build',
        '--platform',
        'linux/arm64',
        '--provenance=false',
        '--sbom=false',
        '--file',
        './template/apps/template-api/Dockerfile',
        '--label',
        `org.opencontainers.image.source=https://github.com/${repository}`,
        '--label',
        `org.opencontainers.image.revision=${commit}`,
        '--tag',
        `ghcr.io/zigordev/template-api:${commit}`,
        '--tag',
        'ghcr.io/zigordev/template-api:main',
        '--push',
        '.',
      ],
    ]);
    expect(ran.summary).toContain(
      `| \`ghcr.io/zigordev/template-api:${commit}\`, also \`main\` | \`${apiDigest}\` |`
    );
  });

  it('stops, and names nothing to attest, when the build fails', () => {
    const ran = runStep(build, { cwd: root, env: app, scenario: { buildFails: true } });

    expect(ran.code).not.toBe(0);
    expect(calls(ran, 'docker', 'imagetools')).toEqual([]);
    expect(ran.outputs).toEqual({});
  });

  it('stops, and names nothing to attest, when GHCR names no digest after the push', () => {
    const ran = runStep(build, { cwd: root, env: app, scenario: { digests: {} } });

    expect(ran.code).not.toBe(0);
    expect(ran.outputs).toEqual({});
  });
});

describe('the deploy workflow: what a run deploys', () => {
  const check = stepScript(deploy, 'Check what this run deploys');
  const valid = {
    TARGET: 'gpool',
    COMMIT: commit,
    GITHUB_REF: 'refs/heads/main',
    COMPOSE_DIR: '.',
    HEALTH_URL: 'https://gpool.zigordev.com/health',
    GITHUB_REPOSITORY: repository,
  };

  it('accepts a target, a full commit on main, a folder in the repo and an https address', () => {
    const ran = runStep(check, { cwd: root, env: valid });

    expect(ran.code, said(ran)).toBe(0);
    expect(ran.stdout).toContain(
      `This run deploys ${commit} of ${repository} to the target gpool.`
    );
  });

  it('needs no health-url, and takes stack as the folder of the shared services', () => {
    const ran = runStep(check, {
      cwd: root,
      env: { ...valid, TARGET: 'platform', COMPOSE_DIR: 'stack', HEALTH_URL: '' },
    });

    expect(ran.code, said(ran)).toBe(0);
  });

  it.each([
    ['a target in capitals', { TARGET: 'GPool' }, 'The target is a name'],
    ['a target that starts with a dash', { TARGET: '-gpool' }, 'The target is a name'],
    ['a short commit', { COMMIT: '1f3a9c2' }, 'not a full SHA'],
    ['a branch other than main', { GITHUB_REF: 'refs/heads/feat/try' }, 'Only main deploys'],
    ['a folder above the repo', { COMPOSE_DIR: '../other' }, 'compose-dir is a folder'],
    ['a folder that climbs out', { COMPOSE_DIR: 'stack/../../x' }, 'compose-dir is a folder'],
    ['an absolute folder', { COMPOSE_DIR: '/etc' }, 'compose-dir is a folder'],
    ['a plain http address', { HEALTH_URL: 'http://gpool.zigordev.com/health' }, 'https address'],
  ])('refuses %s', (_case, wrong, message) => {
    const ran = runStep(check, { cwd: root, env: { ...valid, ...wrong } });

    expect(ran.code).toBe(1);
    expect(ran.stdout).toContain(message);
  });
});

describe('the deploy workflow: the build records', () => {
  const images = stepScript(deploy, "Find this commit's images, and verify how each one was built");
  const env = { COMPOSE_DIR: 'template', COMMIT: commit, GITHUB_REPOSITORY: repository };
  const digests = {
    [`ghcr.io/zigordev/template-api:${commit}`]: apiDigest,
    [`ghcr.io/zigordev/template-web:${commit}`]: webDigest,
  };
  const attested = [
    `ghcr.io/zigordev/template-api@${apiDigest}`,
    `ghcr.io/zigordev/template-web@${webDigest}`,
  ];

  it('verifies each image of the commit once, signed by the publish workflow, and hands each one on by its digest', () => {
    const ran = runStep(images, { cwd: root, env, scenario: { digests, attested } });

    expect(ran.code, said(ran)).toBe(0);
    expect(ran.outputs.images).toBe(attested.join(' '));
    expect(calls(ran, 'gh').map((call) => call.args)).toEqual(
      attested.map((subject) => [
        'attestation',
        'verify',
        `oci://${subject}`,
        '--repo',
        repository,
        '--signer-workflow',
        'zigordev/toolkit/.github/workflows/publish.yml',
        '--source-ref',
        'refs/heads/main',
        '--source-digest',
        commit,
        '--deny-self-hosted-runners',
      ])
    );
    expect(calls(ran, 'docker', 'login')).toEqual([]);
  });

  it('stops before AWS when GHCR shows an image only to someone signed in', () => {
    const ran = runStep(images, {
      cwd: root,
      env,
      scenario: { digests: { [`ghcr.io/zigordev/template-api:${commit}`]: apiDigest }, attested },
    });

    expect(ran.code).toBe(1);
    expect(ran.stdout).toContain(`GHCR shows no image ghcr.io/zigordev/template-web:${commit}`);
    expect(ran.stdout).toContain('the owner makes a new package public once');
    expect(ran.outputs.images).toBeUndefined();
  });

  it('stops before AWS when an image has no build record from this repo', () => {
    const ran = runStep(images, {
      cwd: root,
      env,
      scenario: { digests, attested: attested.slice(0, 1) },
    });

    expect(ran.code).toBe(1);
    expect(ran.stdout).toContain(
      `::error::ghcr.io/zigordev/template-web@${webDigest} has no build record from ${repository}`
    );
    expect(ran.outputs.images).toBeUndefined();
  });

  it('hands on no image for a target that runs none of ours, such as the shared services', () => {
    const folder = product({
      'stack/compose.yaml': `name: platform\nservices:\n  traefik:\n    image: traefik:v3.6.2@sha256:${'c'.repeat(64)}\n`,
      'stack/compose.production.yaml': 'services:\n  traefik:\n    restart: unless-stopped\n',
    });

    const ran = runStep(images, { cwd: folder, env: { ...env, COMPOSE_DIR: 'stack' } });

    expect(ran.code, said(ran)).toBe(0);
    expect(ran.outputs.images).toBe('');
    expect(ran.stdout).toContain('runs no image of ghcr.io/zigordev/');
  });

  it('stops when the compose files run one of our images under a tag that is not VERSION', () => {
    const folder = product({
      'compose.yaml':
        'name: fixed\nservices:\n  fixed-api:\n    image: ghcr.io/zigordev/fixed-api:1.0.0\n',
      'compose.production.yaml': 'services:\n  fixed-api:\n    restart: unless-stopped\n',
    });

    const ran = runStep(images, { cwd: folder, env: { ...env, COMPOSE_DIR: '.' } });

    expect(ran.code).toBe(1);
    expect(ran.stdout).toContain(`Write it as ghcr.io/zigordev/fixed-api:\${VERSION:-local}.`);
  });
});

describe('the deploy workflow: the host and the outside check', () => {
  const host = stepScript(
    deploy,
    'Deploy on the host, check from outside, and roll back on a wrong answer'
  );
  const images = `ghcr.io/zigordev/gpool-api@${apiDigest} ghcr.io/zigordev/gpool-web@${webDigest}`;
  const env = {
    TARGET: 'gpool',
    COMMIT: commit,
    HEALTH_URL: 'https://gpool.zigordev.com/health',
    IMAGES: images,
    GITHUB_REPOSITORY: repository,
    GITHUB_RUN_ID: '4242',
  };
  const deployed = `platform-deploy: result=deployed target=gpool commit=${commit} previous=${previous}`;
  const rolledBack = `platform-deploy: result=rolled-back target=gpool commit=${previous} from=${commit}`;

  function serving(version: string) {
    return {
      status: 200,
      body: JSON.stringify({ status: 'ok', service: 'gpool-web', version, components: {} }),
    };
  }

  function sent(ran: StepRun): { action: string; commit: string; images: string }[] {
    return calls(ran, 'aws', 'send-command').map((call) => {
      const parameters = JSON.parse(call.args[call.args.indexOf('--parameters') + 1] ?? '{}');
      return {
        action: parameters.action[0],
        commit: parameters.commit[0],
        images: parameters.images[0],
      };
    });
  }

  it("sends the verified images to the target's command on the host, and reads its answer", () => {
    const ran = runStep(host, {
      cwd: root,
      env,
      scenario: {
        commands: {
          deploy: { statuses: ['InProgress', 'Success'], output: `pulling\n${deployed}` },
        },
        health: [serving(commit)],
      },
    });

    expect(ran.code, said(ran)).toBe(0);
    expect(calls(ran, 'aws', 'send-command').map((call) => call.args)).toEqual([
      [
        'ssm',
        'send-command',
        '--region',
        'eu-west-1',
        '--document-name',
        'platform-deploy-gpool',
        '--targets',
        'Key=tag:Name,Values=platform-host',
        '--parameters',
        JSON.stringify({ action: ['deploy'], commit: [commit], images: [images] }),
        '--comment',
        `${repository} run 4242`,
        '--query',
        'Command.CommandId',
        '--output',
        'text',
      ],
    ]);
    expect(ran.stdout).toContain(`https://gpool.zigordev.com/health names ${commit}`);
    expect(ran.summary).toContain('### Deploy to gpool');
    expect(ran.summary).toContain(`| Commit | \`${commit}\` |`);
    expect(ran.summary).toContain(`| Previous | \`${previous}\` |`);
    expect(ran.summary).toContain('| On the host | deployed |');
    expect(ran.summary).toContain(
      '| From outside | https://gpool.zigordev.com/health names the commit |'
    );
  });

  it('asks from outside until the answer names the commit, through timeouts, errors and the old version', () => {
    const ran = runStep(host, {
      cwd: root,
      env,
      scenario: {
        commands: { deploy: { output: deployed } },
        health: [
          { status: 0 },
          { status: 502 },
          serving(previous),
          { status: 200, body: 'ok' },
          serving(commit),
        ],
      },
    });

    expect(ran.code, said(ran)).toBe(0);
    expect(calls(ran, 'curl')).toHaveLength(5);
    expect(sent(ran).map((command) => command.action)).toEqual(['deploy']);
  });

  it('rolls back when the answer has not named the commit after 120 seconds', () => {
    const ran = runStep(host, {
      cwd: root,
      env,
      scenario: {
        commands: { deploy: { output: deployed }, rollback: { output: rolledBack } },
        health: [serving(previous)],
      },
    });

    expect(ran.code).toBe(1);
    expect(calls(ran, 'curl')).toHaveLength(25);
    expect(sent(ran)).toEqual([
      { action: 'deploy', commit, images },
      { action: 'rollback', commit, images: '' },
    ]);
    expect(ran.stdout).toContain(
      `::error::https://gpool.zigordev.com/health did not name ${commit} within 120 seconds`
    );
    expect(ran.stdout).toContain(`::error::The host rolled back: ${previous} serves again`);
    expect(ran.summary).toContain(`| Rollback | \`${previous}\` serves again |`);
  });

  it('says that the old version may still serve when the rollback cannot happen', () => {
    const ran = runStep(host, {
      cwd: root,
      env,
      scenario: {
        commands: {
          deploy: { output: deployed },
          rollback: {
            statuses: ['Failed'],
            output: `platform-deploy: result=refused reason=no-previous target=gpool commit=${commit}`,
          },
        },
        health: [{ status: 503 }],
        sleepFactor: 6,
      },
    });

    expect(ran.code).toBe(1);
    expect(ran.stdout).toContain(
      `::error::The rollback did not happen, so ${commit} may still serve`
    );
  });

  it('ends after the answer of the host when there is no address to ask', () => {
    const ran = runStep(host, {
      cwd: root,
      env: { ...env, HEALTH_URL: '', IMAGES: '' },
      scenario: { commands: { deploy: { output: deployed } } },
    });

    expect(ran.code, said(ran)).toBe(0);
    expect(calls(ran, 'curl')).toEqual([]);
    expect(sent(ran)).toEqual([{ action: 'deploy', commit, images: '' }]);
  });

  it('ends green, with a notice, when a newer commit already runs', () => {
    const ran = runStep(host, {
      cwd: root,
      env,
      scenario: {
        commands: {
          deploy: {
            output: `platform-deploy: result=skipped reason=overtaken target=gpool commit=${commit} current=${newer}`,
          },
        },
      },
    });

    expect(ran.code, said(ran)).toBe(0);
    expect(ran.stdout).toContain(`::notice::A newer commit, ${newer}, already runs on gpool`);
    expect(calls(ran, 'curl')).toEqual([]);
  });

  it.each([
    [
      'a gate that failed, after which the version before serves again',
      `platform-deploy: result=failed reason=health target=gpool commit=${commit} restored=${previous}`,
      `::error::The deploy of ${commit} failed on the host at health, and ${previous} serves again.`,
    ],
    [
      'a first deploy that failed, with nothing before it',
      `platform-deploy: result=failed reason=pull target=gpool commit=${commit} restored=none`,
      'failed on the host at pull, and nothing served before this first deploy, so nothing serves now.',
    ],
    [
      'a failure after which the version before could not be brought back',
      `platform-deploy: result=failed reason=unexpected target=gpool commit=${commit} restored=failed`,
      'failed on the host at unexpected, and the version before it could not be brought back, so the product may be down.',
    ],
    [
      'a failure that does not say what serves',
      `platform-deploy: result=failed reason=job target=gpool commit=${commit}`,
      'failed on the host at job, and the host did not say which version serves.',
    ],
    [
      'a refusal while another deploy holds the lock',
      `platform-deploy: result=refused reason=busy target=gpool commit=${commit}`,
      `::error::The host refused the deploy of ${commit}, and changed nothing: busy.`,
    ],
    [
      'a refusal when GitHub or Parameter Store does not answer',
      `platform-deploy: result=refused reason=unreachable target=gpool commit=${commit}`,
      'refused the deploy',
    ],
    [
      'a refusal for a missing secret',
      `platform-deploy: result=refused reason=missing-secrets target=gpool commit=${commit}`,
      'and changed nothing: missing-secrets.',
    ],
    ['a rollback in answer to a deploy', rolledBack, 'answered the deploy with a rollback'],
    [
      'no result line',
      'the script stopped early',
      'wrote no line that starts with platform-deploy:',
    ],
    [
      'an answer for another target',
      `platform-deploy: result=deployed target=other commit=${commit} previous=none`,
      'answered for another target',
    ],
    [
      'an answer for another commit',
      `platform-deploy: result=deployed target=gpool commit=${newer} previous=none`,
      'answered for another commit',
    ],
  ])('fails the run on %s, and asks nothing from outside', (_case, line, message) => {
    const ran = runStep(host, {
      cwd: root,
      env,
      scenario: { commands: { deploy: { statuses: ['Failed'], output: `before\n${line}` } } },
    });

    expect(ran.code).toBe(1);
    expect(ran.stdout).toContain(message);
    expect(calls(ran, 'curl')).toEqual([]);
  });

  it('names in the summary what serves after a failure', () => {
    const ran = runStep(host, {
      cwd: root,
      env,
      scenario: {
        commands: {
          deploy: {
            statuses: ['Failed'],
            output: `platform-deploy: result=failed reason=start target=gpool commit=${commit} restored=${previous}`,
          },
        },
      },
    });

    expect(ran.code).toBe(1);
    expect(ran.summary).toContain(`| On the host | failed at start: ${previous} serves again |`);
  });

  it('reads the last result line of the output', () => {
    const ran = runStep(host, {
      cwd: root,
      env: { ...env, HEALTH_URL: '' },
      scenario: {
        commands: {
          deploy: {
            output: `platform-deploy: result=failed reason=old target=gpool commit=${commit}\n${deployed}`,
          },
        },
      },
    });

    expect(ran.code, said(ran)).toBe(0);
  });

  it('waits for a host to take the command, and for its invocation to exist', () => {
    const ran = runStep(host, {
      cwd: root,
      env: { ...env, HEALTH_URL: '' },
      scenario: {
        commands: {
          deploy: {
            unclaimed: 2,
            statuses: ['error:InvocationDoesNotExist', 'Pending', 'InProgress', 'Success'],
            output: deployed,
          },
        },
      },
    });

    expect(ran.code, said(ran)).toBe(0);
    expect(calls(ran, 'aws', 'list-command-invocations')).toHaveLength(3);
  });

  it('stops at once on any other error of Systems Manager', () => {
    const ran = runStep(host, {
      cwd: root,
      env,
      scenario: { commands: { deploy: { statuses: ['error:AccessDeniedException'] } } },
    });

    expect(ran.code).toBe(1);
    expect(ran.stdout).toContain('Systems Manager did not say how the command');
    expect(calls(ran, 'aws', 'get-command-invocation')).toHaveLength(1);
  });

  it('gives up when no host takes the command within 2 minutes', () => {
    const ran = runStep(host, {
      cwd: root,
      env,
      scenario: { commands: { deploy: { unclaimed: 1000 } }, sleepFactor: 10 },
    });

    expect(ran.code).toBe(1);
    expect(ran.stdout).toContain('No host took the command cmd-deploy within 2 minutes');
    expect(ran.seconds).toBe(120);
  });

  it('gives up when the command does not end within 16 minutes', () => {
    const ran = runStep(host, {
      cwd: root,
      env,
      scenario: { commands: { deploy: { statuses: ['InProgress'] } }, sleepFactor: 8 },
    });

    expect(ran.code).toBe(1);
    expect(ran.stdout).toContain('The command cmd-deploy did not end within 16 minutes');
    expect(ran.seconds).toBe(2 * 8 + 960);
  });

  it('fails when AWS refuses to send the command', () => {
    const ran = runStep(host, { cwd: root, env, scenario: { denied: true } });

    expect(ran.code).not.toBe(0);
    expect(ran.stderr).toContain('AccessDeniedException');
    expect(calls(ran, 'aws')).toHaveLength(1);
  });

  it('keeps what the host and the product write from acting as commands of the runner', () => {
    const ran = runStep(host, {
      cwd: root,
      env,
      scenario: {
        commands: {
          deploy: { output: `::error::from the host\n::add-mask::${previous}\n${deployed}` },
          rollback: { output: rolledBack },
        },
        health: [{ status: 200, body: '::error::from the product' }],
        sleepFactor: 6,
      },
    });
    const fenced = [...ran.stdout.matchAll(/::stop-commands::([0-9a-f]{32})\n([\s\S]*?)\n::\1::/g)];

    expect(fenced.map((match) => match[2])).toEqual([
      expect.stringContaining('::error::from the host'),
      '::error::from the product',
      rolledBack,
    ]);
    expect(ran.stdout.replace(/::stop-commands::[\s\S]*?\n::[0-9a-f]{32}::/g, '')).not.toMatch(
      /::error::from|::add-mask::/
    );
  });
});
