# Run toolkit on a clean laptop

This page takes a laptop with nothing on it to a passing `pnpm check`. It takes about ten minutes, most of them downloads. The check needs no other repo, no running container, no account and no secret.

## What you need first

| Thing  | Why                                                                                                                                                             | How to get it                                                                                                                       |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| git    | To clone the repo                                                                                                                                               | On a Mac it comes with the command line tools: `xcode-select --install`                                                             |
| mise   | It installs the exact versions of Node.js, pnpm, gitleaks and zizmor that `mise.toml` pins                                                                      | Follow [mise's getting started page](https://mise.jdx.dev/getting-started.html), including the step that activates it in your shell |
| Docker | The test of the template's compose files reads them with `docker compose config`. That needs the `docker` command with Compose, and Docker does not have to run | Install [Docker Desktop](https://docs.docker.com/desktop/), which brings both                                                       |

Nothing else is installed by hand. Node.js and pnpm come from mise, and every other tool comes from `pnpm install`.

Running the product template in containers is a separate step, and it needs Docker running and the shared services of `platform`. [The template's README](../template/README.md) describes it.

## The steps

```bash
git clone https://github.com/zigordev/toolkit.git
cd toolkit
mise install
pnpm install
pnpm check
```

| Step           | What it does                                                                                                                       | How you know it worked                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `mise install` | Installs the pinned tools for this folder. The first time, mise asks you to trust the repo's `mise.toml`: answer with `mise trust` | `node --version` prints the version that `mise.toml` names                         |
| `pnpm install` | Installs the dependencies from the lockfile, and installs the git hooks                                                            | Its last lines say `sync hooks` and name `pre-commit`, `commit-msg` and `pre-push` |
| `pnpm check`   | Runs what the pipeline runs: lint, build, type check, and the tests with coverage                                                  | It ends with `check took` and a number of seconds, with no error above that line   |

## Before your first commit

Every commit in a zigordev repo is made as zigordev. Set that once in this clone:

```bash
git config user.name zigordev
git config user.email zigordev@gmail.com
```

`gh` has to act as the same account. `gh config get user -h github.com` prints the account it uses.

The commit hook refuses a commit under another identity, so a mistake here shows at once.

## Working in it

| You want to                                   | Run                               |
| --------------------------------------------- | --------------------------------- |
| Check everything, as the pipeline does        | `pnpm check`                      |
| Check faster, without coverage                | `pnpm check:quick`                |
| Fix the formatting                            | `pnpm format`                     |
| Run one test file                             | `pnpm exec vitest run <path>`     |
| Run one rule of the conformance check         | `pnpm exec zigordev check <rule>` |
| Bring the shared files at the root up to date | `pnpm exec zigordev sync`         |

A change starts with the `start-work` skill and ends with the `finish-work` skill. Both are in `.claude/skills/`, and they are short enough to follow by hand.

## When something fails

| What you see                                           | What it means                                                                    | What to do                                                            |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `node` is missing, or it is the wrong version          | mise is not active in this shell                                                 | Activate mise as its getting started page says, then open a new shell |
| `pnpm install` refuses a package as too new            | pnpm waits one day before it accepts a new release                               | Wait, or pin the release before it in `pnpm-workspace.yaml`           |
| `pnpm install` reports a trust downgrade               | A package's newest release was published with less proof than the one before     | Pin the earlier release, and look at why the publisher changed        |
| A git hook does not run at all                         | The hooks are not installed                                                      | `pnpm install`                                                        |
| `compose.test.ts` fails with `spawnSync docker ENOENT` | The `docker` command is not installed, or not on the `PATH`                      | Install Docker Desktop. It does not have to run for the check         |
| `gitleaks` or `zizmor` is missing                      | The pinned tools are not installed                                               | `mise install`                                                        |
| `zigordev check` reports `shared`                      | A shared file at the root differs from its source in `packages/dev/shared`       | `pnpm exec zigordev sync`, then commit both copies                    |
| Every pnpm command warns about `NODE_AUTH_TOKEN`       | An old line in your own `~/.npmrc` points at a registry this repo no longer uses | Nothing. It is harmless, and it is not this repo's file               |
