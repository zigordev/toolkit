# toolkit

The shared base of every zigordev repo: the packages published as `@zigordev/*`, the product template, the pipelines the other repos call, the session rules and the handbook. It deploys nothing. The core rules in `.claude/rules/core.md` apply here as everywhere.

## Where things live

| Path                  | What it holds                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| `packages/dev`        | `@zigordev/dev`: the `zigordev` command, the shared configs and the shared files                        |
| `packages/dev/shared` | The one true copy of every file that all repos share. `zigordev sync` copies them to the root of a repo |
| `.claude/`            | This repo's own copy of the shared rules, skills, hooks and permissions                                 |
| `.github/workflows`   | `check.yml` is the pipeline every repo calls, and `ci.yml` runs it here                                 |
| `mise.toml`           | The pinned versions of Node.js, pnpm, gitleaks and zizmor                                               |
| `pnpm-workspace.yaml` | The workspace, the single version of each dependency, and the supply-chain settings                     |

## Commands

- `pnpm install` installs the dependencies and the git hooks.
- `pnpm check` runs what CI runs: lint, build, type check, and tests with coverage. It prints how long it took.
- `pnpm check:quick` runs the same without coverage. The push hook runs it.
- `pnpm format` fixes the formatting, the import order and the Markdown problems that have a safe fix.
- `pnpm exec vitest run <path>` runs one test file.
- `pnpm exec zigordev check [rule...] [file...]` runs the rules a machine can check, all of them or the ones named.
- `pnpm exec zigordev sync` copies the shared files from `packages/dev/shared` to the root of this repo.

## Rules of this repo

- A shared file is edited in `packages/dev/shared`, never at the root. Run `pnpm exec zigordev sync` afterwards and commit both copies, or `pnpm check` fails.
- A change under `packages/dev/shared/.claude` changes how every session works in every repo. Its pull request says which behaviour changes, and it stays a draft until the owner has read it.
- A version lives once, in the `catalog` of `pnpm-workspace.yaml`, as an exact version. A package refers to it with `catalog:`.
- A new rule of `zigordev check` comes with a test that breaks it, and with a line in `packages/dev/README.md` and in the table of the core rules.
- The job named `check` is the required check in every repo. Renaming it, or a job inside `check.yml`, breaks merging everywhere, so say it in the pull request.
- Coverage counts every package's `src`, its root `.js` files and the hook scripts, with a floor of 90%.
- The test for the guard hook is `packages/dev/guard.test.js`. A new case for the guard starts there.
