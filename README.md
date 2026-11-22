# toolkit

The shared base of every zigordev repository: the packages published as `@zigordev/*`, the product template, the pipelines the other repos call, the rules and the handbook. It deploys nothing.

The repo is being built step by step, and each step arrives as its own pull request. This page describes what exists today.

## What it is

| Path                  | What it holds                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `packages/dev`        | `@zigordev/dev`: the Biome config, the TypeScript base, the git hooks and the commit rules that every repo shares |
| `mise.toml`           | The pinned versions of Node.js, pnpm, gitleaks and zizmor                                                         |
| `pnpm-workspace.yaml` | The workspace, the single version of each dependency, and the supply-chain settings                               |
| `.github/workflows`   | The pipeline. `check.yml` is the part every repo will call, and `ci.yml` runs it for this repo                    |

Every pull request runs the pipeline. It runs `pnpm check`, exactly as on a laptop, and three jobs that only GitHub can run: the pull request's title, the dependencies it adds, and a scan of the code. One job named `check` passes only when all of them passed, and it is the only check `main` requires.

## Why it exists

Every zigordev repo is built with the same tools, set up the same way. Keeping that setup in one versioned place means a repo receives a change as a dependency update, not as a copy made by hand, so the repos cannot drift apart.

## What it is built with

| Tool                         | What it does here                                                                                                                                                                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [mise](https://mise.jdx.dev) | Installs the exact Node.js, pnpm, gitleaks and zizmor versions that `mise.toml` pins                                                                                                                                                         |
| Node.js 26                   | Runs every script and every test                                                                                                                                                                                                             |
| pnpm 12                      | Installs dependencies and links the workspace. It takes every version from one catalog, waits one day before it accepts a new release, blocks the install scripts of dependencies, and refuses a package whose publisher became less trusted |
| TypeScript 7                 | Checks types in strict mode                                                                                                                                                                                                                  |
| Biome 2                      | Lints and formats TypeScript, JavaScript, JSON and CSS, and formats YAML and Markdown                                                                                                                                                        |
| markdownlint                 | Lints the Markdown                                                                                                                                                                                                                           |
| lefthook                     | Runs the hooks before a commit and before a push                                                                                                                                                                                             |
| commitlint                   | Keeps commit titles in the Conventional Commits format, and refuses attribution lines                                                                                                                                                        |
| gitleaks                     | Stops a commit that contains something shaped like a secret                                                                                                                                                                                  |
| Vitest 5                     | Runs the tests and holds coverage above a 90% floor                                                                                                                                                                                          |
| zizmor                       | Lints the pipeline files for unsafe patterns, such as an action that is not pinned to a commit                                                                                                                                               |
| GitHub Actions               | Runs the pipeline on every pull request and on every merge to `main`                                                                                                                                                                         |
| CodeQL                       | Scans our own code for vulnerable patterns, in the pipeline                                                                                                                                                                                  |
| Dependency Review            | Fails a pull request that adds a dependency with a known flaw                                                                                                                                                                                |

It needs no other repo and no running service.

## Quick start

Install [mise](https://mise.jdx.dev/getting-started.html) and activate it in your shell. Then:

```bash
git clone https://github.com/zigordev/toolkit.git
cd toolkit
mise install
pnpm install
pnpm check
```

`mise install` installs the pinned tools. `pnpm install` installs the dependencies and the git hooks. `pnpm check` runs the full check, and on a clean clone it must end with `check took` and a number of seconds, with no error above it.

| Command            | What it does                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `pnpm check`       | The full check: lint, build, type check, and tests with coverage. It prints how long it took |
| `pnpm check:quick` | The part of the check that needs no containers. The push hook runs it                        |
| `pnpm format`      | Fixes the formatting, the import order and the Markdown problems that have a safe fix        |
| `pnpm lint`        | Reports lint and formatting problems without changing a file                                 |
| `pnpm typecheck`   | Checks the types                                                                             |
| `pnpm test`        | Runs the tests with coverage                                                                 |
| `pnpm build`       | Compiles the packages that are published. None is compiled yet                               |

[packages/dev](packages/dev/README.md) explains what each git hook does.
