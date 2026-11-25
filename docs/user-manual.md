# Use toolkit from another repo

`toolkit` is a library, so its users are the other zigordev repos. This page says what a repo takes from it, and how. Each part says what exists on 2026-11-22, because the platform is still being built.

| A repo takes                 | From                              | Exists today                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The developer setup          | `@zigordev/dev`                   | Yes. On npm since 2026-11-22                                                                                                                                                                                                                                                                                                                                                                                                                         |
| The session rules            | `packages/dev/shared/.claude`     | Yes                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| The pipeline                 | `.github/workflows/check.yml`     | Yes. `platform` calls it since 2026-11-22                                                                                                                                                                                                                                                                                                                                                                                                            |
| Delivery of a product        | `publish.yml` and `deploy.yml`    | Written on 2026-11-24. The host's side is built in `platform` at the same time                                                                                                                                                                                                                                                                                                                                                                       |
| Dependency updates           | `renovate/default.json`           | Yes                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| The way to record a decision | The `write-decision-record` skill | Yes                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| The shared packages for apps | `packages/`                       | `@zigordev/config`, `@zigordev/otel`, `@zigordev/test` and `@zigordev/api` are on npm since 2026-11-23. The others arrive from phase 6 on                                                                                                                                                                                                                                                                                                            |
| A product to start from      | `template/`                       | Its first two slices are complete since 2026-11-23: an API and a web app with their images, the compose files and the contract test, then the notes API on its own PostgreSQL with its migrate job, its OpenAPI file and its generated client. Since 2026-11-25 it also has its flags, sign-in, and sign-in's emails sent to the notifications service over Kafka. [Its README](../template/README.md) lists every slice, and the notes pages follow |

## The developer setup

`@zigordev/dev` gives a repo the `zigordev` command, one Biome config, the TypeScript bases, one set of git hooks and one set of commit rules. [Its README](../packages/dev/README.md) says how to add it, under "How to use it".

After that, three commands are all a repo needs:

```bash
pnpm exec zigordev sync
pnpm exec zigordev check
pnpm check
```

The first links the shared rules and skills into the repo and copies the other shared files. The second checks the repo against every rule a machine can check. The third runs the whole check, as the pipeline does.

The pull request template is one of the shared files. A pull request opened on GitHub's site therefore starts with the same six sections in every repo: What, Why, How it was tested, Observability, Docs and Follow-ups.

Another repo adds `@zigordev/dev` as a dev dependency from npm. This repo uses its own copy, through the workspace.

## The shared packages for apps

An app takes its shared code from npm as packages, all under one version.

| Package            | What it gives an app                                                                                                                           | On npm                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `@zigordev/config` | Its settings, read from the environment once through a Zod schema, and a start that fails when one is missing or wrong                         | Yes, since version 1.8.0 of 2026-11-23  |
| `@zigordev/otel`   | Its telemetry: traces and metrics through OpenTelemetry, log lines that carry the trace, and the answer of the health route                    | Yes, since version 1.8.0 of 2026-11-23  |
| `@zigordev/api`    | The base of an API: the error format, paging, sign-in checks, a rate limit, the OpenAPI pages, the health route, the database and a clean stop | Yes, since version 1.16.0 of 2026-11-23 |
| `@zigordev/test`   | Its tests' helpers: a real PostgreSQL with one migrated copy per test file, and the harness for API tests                                      | Yes, since version 1.16.0 of 2026-11-23 |

Each package's README says how an app uses it: [`@zigordev/config`](../packages/config/README.md), [`@zigordev/otel`](../packages/otel/README.md), [`@zigordev/api`](../packages/api/README.md) and [`@zigordev/test`](../packages/test/README.md). A package is in this repo before it is on npm, and [Packages](handbook/packages.md) says how it gets there.

## The session rules

`zigordev sync` also sets up `.claude/` in the repo. `.claude/rules` and `.claude/skills` become links into the installed `@zigordev/dev`: the core rules, the seven area rules and the six skills. The permission rules and the guard hook are copied, so that they work before any install. A session started in the repo then works under them at once. An update of `@zigordev/dev` brings new rules and skills through the links, with no change in the repo, as [record 0049](adr/0049-shared-rules-and-skills-are-links-to-the-installed-package.md) says.

A repo writes one file itself, `CLAUDE.md`, of under 100 lines: what the repo is, its commands, where things live and its own rules. [This repo's file](../CLAUDE.md) is the model.

The rules are changed in `toolkit` only. In another repo they live in `node_modules`, so an edit there is lost at the next install, and a copied file that was edited fails that repo's check.

## The pipeline

A repo's own workflow is a short caller. It has two jobs: one calls `check.yml`, and one is the gate named `check`, which passes only when the first one passed. [This repo's caller](../.github/workflows/ci.yml) is the model.

Another repo's caller differs in one line. Where this repo names itself, the other repo names `zigordev/toolkit` and one commit of it, pinned like any action. `platform` is the first outside caller, with this line:

```yaml
uses: zigordev/toolkit/.github/workflows/check.yml@59bfb39019ea676693dde99c0b0a01dc600cad8a # v1.1.0
```

The commit is the one that the version tag points at, and the job that holds the line grants `contents: read` and `security-events: write`. [The pipeline](handbook/the-pipeline.md) shows the whole file, and says how a new repo takes it.

In the repo's settings, `check` is the one required check on `main`. A new repo also needs its dependency graph switched on, or the Dependencies job fails.

A repo that holds a product adds `with:` and `product-folder: .` under that line. The pipeline then builds the product's images and holds each app to the platform contract, with the product's own script `check:contract`. [The pipeline](handbook/the-pipeline.md) has both.

## Delivering a product

A product's caller adds two jobs after `check`, on a push to `main` only. `publish.yml` builds each app's image for arm64, pushes it as `ghcr.io/zigordev/<app>:<commit>` and attests it. `deploy.yml` verifies each image's build record, asks the host through AWS Systems Manager to run the commit, asks the product's `/health` from outside, and rolls back on a wrong answer. Both are pinned to the same commit of `toolkit` as `check.yml`.

The deploy needs a secret that the owner sets, `AWS_ACCOUNT_ID`, and the product's entry in `platform`. [Delivery](handbook/delivery.md) shows the whole caller and the four things a product needs before its first deploy.

## Publishing packages

Most repos publish nothing. A repo that does, such as `platform` with its bundle, takes three things:

| What                 | How                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| semantic-release     | A dev dependency of the repo                                                                          |
| The release settings | A file `release.config.js` with one line: `export { default } from '@zigordev/dev/semantic-release';` |
| The release job      | A job in the repo's caller that runs `release.yml` after `check`, on a push to `main` only            |

[This repo's caller](../.github/workflows/ci.yml) and [its settings file](../release.config.js) are the models. [How toolkit reaches the other repos](cloud-first-deploy.md) says what the release does, and how a title decides the version.

A package starts marked `"private": true`, and the release leaves it alone. It becomes public once the owner has made its first publish. [Packages](handbook/packages.md) walks through it with an example.

## Dependency updates

`zigordev sync` writes `renovate.json`, which points at the preset in this repo and switches off the badges that the Renovate app adds. Renovate then proposes updates in that repo the same way as everywhere else. A new version of `toolkit` arrives as one pull request, with no wait, so the repo exempts `@zigordev/*` from pnpm's own wait under `minimumReleaseAgeExclude` in its `pnpm-workspace.yaml`. [Dependency updates](handbook/dependency-updates.md) says what merges by itself, and when.

The Renovate app has to have access to the repo. It is installed on the account, with access to every repo.

## Recording a decision

A decision that adds, removes or replaces a tool, a service, a data store, a provider, a deploy path or a public interface gets a record in the repo's `docs/adr/`. The `write-decision-record` skill holds the steps and the template. Each repo numbers its records from 0001.

The decisions that shape the whole platform are recorded [in this repo](adr/README.md).

## Finding out how something is meant to work

| You want to know                     | Read                                                             |
| ------------------------------------ | ---------------------------------------------------------------- |
| How the whole platform fits together | [The platform](handbook/the-platform.md)                         |
| Which tool does which job            | [The tools](handbook/tools.md)                                   |
| Why something was decided            | [The decision records](adr/README.md)                            |
| The rules a session works under      | `.claude/rules/core.md`, and the area rule for the files in hand |
