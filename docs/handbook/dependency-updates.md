# Dependency updates

## What it is

Renovate is an app on GitHub that reads a repo, notices that something it depends on has a newer version, and opens a pull request that takes it. It follows everything a repo pins: the packages in `pnpm-workspace.yaml` and `package.json`, the tools in `mise.toml`, and the actions in the workflows.

Every repo carries the same small file, `renovate.json`. It points at one preset, `renovate/default.json` in `toolkit`, and the preset holds the settings, so all repos update the same way.

The file holds one setting itself. The Renovate app adds badge columns to every pull request, such as Age and Confidence, and `renovate.json` switches them off. Renovate reads that switch from a repo's own file, and not from a preset the file points at.

## Why we have it, and what we would lose without it

Without it, versions go stale until someone remembers to look. Then many updates arrive at once, and a break hides among them. With it, each update arrives alone and small, and the check says at once whether it is safe.

Every green merge of a product deploys it. An update that merges by itself therefore deploys by itself, which is why the preset says so exactly when Renovate may merge.

## How it works here, on the laptop and in production

Renovate runs on GitHub only. Nothing of it runs on the laptop or on the host.

| Setting                                      | What it does                                                                                                                                        | Why                                                                                                                                                 |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| A wait of one day                            | A release is proposed once it is at least one day old                                                                                               | A compromised release is usually found and withdrawn within its first day. pnpm waits the same day, so the two agree                                |
| Patch and minor updates merge by themselves  | Once `check` is green, Renovate merges the pull request, as a squash                                                                                | Nobody has to look at an update that the check has passed                                                                                           |
| Only on weekdays between 08:00 and 18:00     | Renovate merges nothing at night or on a weekend                                                                                                    | A merge is a deploy, and a deploy should happen while someone is around                                                                             |
| A major version waits                        | It is proposed a month after its release, and never merges by itself                                                                                | A new major version can break things, and it arrives as its own task                                                                                |
| Node.js major versions are never proposed    | Renovate leaves `node` and `@types/node` on their major version                                                                                     | The Node.js version is a decision for the whole platform                                                                                            |
| Our own packages and pipeline arrive at once | A new version of a `@zigordev/*` package, or of the pipeline a repo calls, is proposed with no wait, and all of them in one pull request            | They are our own releases, and the check passed them in the repo they come from. A new `toolkit` version changes several lines that belong together |
| Groups                                       | Node.js and its types move together, pnpm moves in `mise.toml` and `package.json` together, and packages that are released together arrive together | One pull request per thing that changes as one                                                                                                      |
| Pinned actions                               | An action is pinned to a commit, with its exact version beside it                                                                                   | It is the form the `actions` rule of `zigordev check` asks for                                                                                      |
| A short pull request                         | The description holds the table of updates, with no badges and no release notes from elsewhere                                                      | A squash merge turns the description into the commit on `main`                                                                                      |

Renovate does the merging itself. GitHub's own auto-merge would merge the moment the check is green, at any hour, so the preset switches it off for Renovate. The price is time: Renovate merges on its next run after the check passed, and one pull request per run.

When GitHub squashes a pull request that Renovate opened, it ends the commit's message with a line of its own: `Co-authored-by: renovate[bot]`, followed by Renovate's address. Nobody writes that line, and nobody can remove it. The `attribution` rule of `zigordev check` refuses every line that credits a tool or a co-author. It accepts this one line, on a commit that Renovate authored, and nowhere else.

### Which title an update gets, and why it matters

Renovate titles a pull request as a Conventional Commit, and the title decides what the merge does next. A repo that publishes packages releases on a title that starts with `fix` or `feat`, and on no other. So the title is what carries an update on to the products, or leaves it in the repo.

| The update changes                                              | Its title starts with | What follows the merge                                                          |
| --------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------- |
| A tool, a test library, an action, or anything else             | `chore(deps)`         | Nothing is released, because nothing that a package ships has changed           |
| An image in a compose file under `stack/`                       | `fix(deps)`           | `platform` publishes `@zigordev/stack`, whose compose files those are           |
| A version in the catalog named `shipped`                        | `fix(deps)`           | The repo publishes its packages, which ship that version to every product       |
| A `dependencies` entry that holds its version in `package.json` | `fix(deps)`           | The repo releases. This is Renovate's own rule for what code needs when it runs |

The first and the last row come from `config:recommended`, the preset of Renovate that ours builds on. The two middle rows are rules of our own. When one pull request holds several updates, Renovate gives it the strongest of their titles, so a group with one `fix` in it is a `fix`.

It is safe to release such an update with no person looking, because the check that it passed is a real one. `platform` starts the shared services on every pull request, and `toolkit` runs the tests of every package.

The catalog named `shipped` is there because of how Renovate reads a catalog. A package that a repo publishes ships the exact versions of what it needs to run, such as pino in `@zigordev/otel`, and those versions live in a catalog of `pnpm-workspace.yaml`. Renovate reads every entry of one catalog as the same kind of thing, whatever refers to it, so it cannot tell pino from Vitest there. It can tell one catalog from another. So what a published package lists under `dependencies` lives in a catalog of its own, named `shipped`, and the rule titles an update there as a fix. [Packages](packages.md) shows the catalog. A repo that publishes packages and names its catalog `shipped` gets the same titles with no rule of its own.

Renovate also keeps one issue open in each repo, the Dependency Dashboard. It lists every update: the open ones, the ones still waiting for their day or their month, and the ones that failed.

### The overrides in force

An override replaces a flawed dependency of a dependency with a fixed version, under `overrides` in `pnpm-workspace.yaml`. [Record 0033](../adr/0033-a-flawed-dependency-of-a-dependency-is-replaced-by-an-override.md) says when one is allowed. Renovate never removes one, so this table says when each goes.

| Line                          | Brought in by                                                    | Flaw                                                                     | It goes when                                                                                                                                                                                                                                                                |
| ----------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `katex: 0.19.1`               | markdownlint, through `micromark-extension-math` 3.1.0           | [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7) | A release of `micromark-extension-math` asks for katex 0.18.2 or later                                                                                                                                                                                                      |
| `archiver-utils>glob: 14.0.6` | Testcontainers 12.2.2, through `archiver` 7 and `archiver-utils` | [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) | A release of Testcontainers drops `archiver`, as [testcontainers-node#1652](https://github.com/testcontainers/testcontainers-node/pull/1652) does. Until 2026-11-27 it is an exception to the one-month rule for a new major version, which the owner allowed on 2026-11-23 |

## How to use it, with one worked example

A repo needs one file, which `zigordev sync` writes: `renovate.json`.

Take a new patch release of Biome. On its first day nothing happens. On the second day Renovate opens a pull request titled `chore(deps): update dependency @biomejs/biome to v2.6.9`, which changes the one line in the catalog and the lockfile. The pipeline runs on it like on any pull request. If `check` is green and it is a weekday between 08:00 and 18:00, Renovate merges it on its next run. Outside those hours the pull request waits, green, until the window opens.

A major release arrives differently. A month after its release Renovate opens the pull request and leaves it open. A person reads what changed, makes the code fit on that branch if it has to, and merges it.

A new version of `toolkit` arrives differently too. On its next run after the release, Renovate opens one pull request for it, named after the group `zigordev`. It changes every `@zigordev/*` package in the catalog, and the commit of the pipeline in the repo's workflow, to that one version. It merges by itself in the window like any patch or minor update. A major version of our own is proposed at once as well, and waits for a person.

For that pull request to install what it proposes, the repo exempts our own packages from pnpm's wait, in its `pnpm-workspace.yaml`:

```yaml
minimumReleaseAgeExclude:
  - "@zigordev/*"
```

To change how updates behave, change `renovate/default.json` in `toolkit`. Every repo follows on Renovate's next run. A test in `packages/dev/src/renovate.test.ts` holds the decided values, so a changed decision is a deliberate change there too.

## How to check that it works, and what to do when it does not

| What you see                                                                    | What it means                                                                                       | What to do                                                                                                        |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| An issue titled "Dependency Dashboard"                                          | Renovate reads the repo and its config is valid                                                     | Nothing. It is the place to see what waits                                                                        |
| An issue that says the configuration needs fixing                               | The preset or `renovate.json` has an error, and Renovate has stopped                                | Fix the file it names. Renovate closes the issue on its next run                                                  |
| A green pull request from Renovate that stays open                              | It is outside the window, or Renovate has not run since the check passed                            | Wait for the window and for about two hours of it                                                                 |
| A red pull request from Renovate                                                | The update breaks the check                                                                         | Read the failing job. Fix the code on that branch, or close the pull request to skip that version                 |
| A pull request from Renovate with a note that the lockfile could not be updated | pnpm refused the new version: it is too new, or its publisher became less trusted                   | Wait for the next release, or look at why the publisher changed                                                   |
| No pull request for a release you know of                                       | It is still inside its day or its month                                                             | The Dependency Dashboard lists it as pending                                                                      |
| The pull request for our own packages says the lockfile could not be updated    | pnpm in that repo still makes our own packages wait a day                                           | Add `@zigordev/*` under `minimumReleaseAgeExclude` in the repo's `pnpm-workspace.yaml`                            |
| A new image under `stack/` arrives titled `chore(deps)`                         | The rule of the preset did not match it                                                             | Read the file's path in the pull request. The rule matches the Docker Compose files under `stack/`, and no other  |
| `main` is red after Renovate merged, and the Quality job names `attribution`    | The repo's `@zigordev/dev` is older than 1.7.1, the first version that accepts the line GitHub adds | Take the newer `@zigordev/dev`. Until then, `main` turns green again with the next merge that is not Renovate's   |
| A pull request from Renovate whose table has badge columns                      | The switch in `renovate.json` no longer names the preset that adds them                             | Read which badge preset the Renovate app applies, and name it under `ignorePresets` in the shared `renovate.json` |
