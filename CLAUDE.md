# toolkit

The shared base of every zigordev repo: the packages published as `@zigordev/*`, the product template, the pipelines the other repos call, the session rules and the handbook. It deploys nothing. The core rules in `.claude/rules/core.md` apply here as everywhere.

## Where things live

| Path                    | What it holds                                                                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/dev`          | `@zigordev/dev`: the `zigordev` command, the shared configs and the shared files                                                                                            |
| `packages/dev/shared`   | The one true copy of every file that all repos share. `zigordev sync` copies them to the root of a repo                                                                     |
| `packages/config`       | `@zigordev/config`: an app's settings, read from the environment once through a Zod schema                                                                                  |
| `packages/otel`         | `@zigordev/otel`: a service's traces, metrics, log lines and health answer                                                                                                  |
| `packages/test`         | `@zigordev/test`: a real PostgreSQL for tests, with one migrated copy per test file, and the harness that builds an app for API tests                                       |
| `template/`             | The product template. It and its apps are members of this workspace, and use the packages through `workspace:*`. Its compose files and Dockerfiles build from the repo root |
| `.claude/`              | This repo's own copy of the shared rules, skills, hooks and permissions                                                                                                     |
| `.github/workflows`     | `check.yml` is the pipeline every repo calls, `release.yml` tags and publishes, and `ci.yml` runs both here                                                                 |
| `renovate/default.json` | The Renovate preset that every repo extends. `packages/dev/src/renovate.test.ts` holds the decided values                                                                   |
| `docs/`                 | The standard docs, the handbook in `docs/handbook/`, and the decision records in `docs/adr/`                                                                                |
| `mise.toml`             | The pinned versions of Node.js, pnpm, gitleaks and zizmor                                                                                                                   |
| `pnpm-workspace.yaml`   | The workspace, the single version of each dependency, and the supply-chain settings                                                                                         |

## Commands

- `pnpm install` installs the dependencies and the git hooks.
- `pnpm check` runs what CI runs: lint, build, type check, and tests with coverage. It prints how long it took.
- `pnpm check:quick` runs the same without coverage and without the tests that need a container. The push hook runs it.
- A test that needs a container is named `*.db.test.ts` and belongs to the Vitest project `<name>:db`, from the `vitest.db.config.ts` beside the package's or the app's `vitest.config.ts`. Docker has to run for it.
- `pnpm format` fixes the formatting, the import order and the Markdown problems that have a safe fix.
- `pnpm exec vitest run <path>` runs one test file.
- `pnpm --dir template run local:up` starts the shared services from `@zigordev/stack` and the template in containers. `local:down` stops the template only.
- `pnpm --dir template dev web` or `pnpm --dir template dev api` runs that one app on this Mac with hot reload, beside the containers. Its settings are in the app's `.env.development`.
- `pnpm --dir template run check:contract` builds the template's images and holds both apps to the platform contract. It needs Docker running, and the pipeline's Contract job runs the same.
- `pnpm exec zigordev check [rule...] [file...]` runs the rules a machine can check, all of them or the ones named.
- `pnpm exec zigordev sync` copies the shared files from `packages/dev/shared` to the root of this repo.
- `pnpm exec zigordev release plan` says which public packages npm lacks at the latest tagged version. It changes nothing.

## Rules of this repo

- A shared file is edited in `packages/dev/shared`, never at the root. Run `pnpm exec zigordev sync` afterwards and commit both copies, or `pnpm check` fails.
- A change under `packages/dev/shared/.claude` changes how every session works in every repo. Its pull request says which behaviour changes, and it stays a draft until the owner has read it.
- A version lives once, as an exact version, in one of the two catalogs of `pnpm-workspace.yaml`. What a package under `packages/` lists under `dependencies` lives in the catalog named `shipped`, referred to as `catalog:shipped`. Everything else lives in the default catalog, referred to as `catalog:`. `packages/dev/src/workspace.test.ts` holds both.
- A new rule of `zigordev check` comes with a test that breaks it, and with a line in `packages/dev/README.md` and in the table of the core rules.
- The job named `check` is the required check in every repo. Renaming it, or a job inside `check.yml`, breaks merging everywhere, so say it in the pull request.
- Coverage counts every package's `src`, its root `.js` files, the hook scripts and the `src` of the template's apps, with a floor of 90%.
- The test for the guard hook is `packages/dev/guard.test.js`. A new case for the guard starts there.
- A new package starts with `"private": true`. It goes public only after the owner has run `zigordev first-publish` for it, which a session never runs without `--dry-run`: it signs in to npm as the owner.
- A decision gets a record in `docs/adr/`, written with the `write-decision-record` skill, and a row in the index there.
- A tool the owner has agreed to gets its row in `docs/handbook/tools.md` in the same pull request that adds it.
- A handbook page is written in the phase that builds its piece, and `docs/handbook/README.md` lists it in the reading order.
