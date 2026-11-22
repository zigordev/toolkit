# Use toolkit from another repo

`toolkit` is a library, so its users are the other zigordev repos. This page says what a repo takes from it, and how. Each part says what exists on 2026-11-22, because the platform is still being built.

| A repo takes                 | From                              | Exists today                                            |
| ---------------------------- | --------------------------------- | ------------------------------------------------------- |
| The developer setup          | `@zigordev/dev`                   | Yes. On npm since 2026-11-22                            |
| The session rules            | `packages/dev/shared/.claude`     | Yes                                                     |
| The pipeline                 | `.github/workflows/check.yml`     | Yes. The first outside caller is `platform`, in phase 2 |
| Dependency updates           | `renovate/default.json`           | Yes                                                     |
| The way to record a decision | The `write-decision-record` skill | Yes                                                     |
| The shared packages for apps | `packages/`                       | Not yet. They arrive from phase 2 on                    |
| A product to start from      | `template/`                       | Not yet. Its first slice arrives in step 2.7            |

## The developer setup

`@zigordev/dev` gives a repo the `zigordev` command, one Biome config, the TypeScript bases, one set of git hooks and one set of commit rules. [Its README](../packages/dev/README.md) says how to add it, under "How to use it".

After that, three commands are all a repo needs:

```bash
pnpm exec zigordev sync
pnpm exec zigordev check
pnpm check
```

The first copies the shared files into the repo. The second checks the repo against every rule a machine can check. The third runs the whole check, as the pipeline does.

The pull request template is one of the shared files. A pull request opened on GitHub's site therefore starts with the same six sections in every repo: What, Why, How it was tested, Observability, Docs and Follow-ups.

Another repo adds `@zigordev/dev` as a dev dependency from npm. This repo uses its own copy, through the workspace.

## The session rules

`zigordev sync` also copies `.claude/` into the repo: the core rules, the seven area rules, the three skills, the permission rules and the guard hook. A session started in the repo then works under them at once.

A repo writes one file itself, `CLAUDE.md`, of under 100 lines: what the repo is, its commands, where things live and its own rules. [This repo's file](../CLAUDE.md) is the model.

The rules are changed in `toolkit` only. A copy that was edited in another repo fails that repo's check.

## The pipeline

A repo's own workflow is a short caller. It has two jobs: one calls `check.yml`, and one is the gate named `check`, which passes only when the first one passed. [This repo's caller](../.github/workflows/ci.yml) is the model.

Another repo's caller differs in one line. Where this repo names itself, the other repo names `zigordev/toolkit` and one commit of it, pinned like any action. That line gets its exact form when `platform` becomes the first outside caller.

In the repo's settings, `check` is the one required check on `main`. A new repo also needs its dependency graph switched on, or the Dependencies job fails.

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

`zigordev sync` writes `renovate.json`, which points at the preset in this repo and switches off the badges that the Renovate app adds. Renovate then proposes updates in that repo the same way as everywhere else. [Dependency updates](handbook/dependency-updates.md) says what merges by itself, and when.

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
