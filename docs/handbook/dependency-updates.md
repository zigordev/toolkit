# Dependency updates

## What it is

Renovate is an app on GitHub that reads a repo, notices that something it depends on has a newer version, and opens a pull request that takes it. It follows everything a repo pins: the packages in `pnpm-workspace.yaml` and `package.json`, the tools in `mise.toml`, and the actions in the workflows.

Every repo carries the same two lines in `renovate.json`, which point at one preset, `renovate/default.json` in `toolkit`. The preset holds every setting, so all repos update the same way.

## Why we have it, and what we would lose without it

Without it, versions go stale until someone remembers to look. Then many updates arrive at once, and a break hides among them. With it, each update arrives alone and small, and the check says at once whether it is safe.

Every green merge of a product deploys it. An update that merges by itself therefore deploys by itself, which is why the preset says so exactly when Renovate may merge.

## How it works here, on the laptop and in production

Renovate runs on GitHub only. Nothing of it runs on the laptop or on the host.

| Setting                                     | What it does                                                                                                                                        | Why                                                                                                                  |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| A wait of one day                           | A release is proposed once it is at least one day old                                                                                               | A compromised release is usually found and withdrawn within its first day. pnpm waits the same day, so the two agree |
| Patch and minor updates merge by themselves | Once `check` is green, Renovate merges the pull request, as a squash                                                                                | Nobody has to look at an update that the check has passed                                                            |
| Only on weekdays between 08:00 and 18:00    | Renovate merges nothing at night or on a weekend                                                                                                    | A merge is a deploy, and a deploy should happen while someone is around                                              |
| A major version waits                       | It is proposed a month after its release, and never merges by itself                                                                                | A new major version can break things, and it arrives as its own task                                                 |
| Node.js major versions are never proposed   | Renovate leaves `node` and `@types/node` on their major version                                                                                     | The Node.js version is a decision for the whole platform                                                             |
| Groups                                      | Node.js and its types move together, pnpm moves in `mise.toml` and `package.json` together, and packages that are released together arrive together | One pull request per thing that changes as one                                                                       |
| Pinned actions                              | An action is pinned to a commit, with its exact version beside it                                                                                   | It is the form the `actions` rule of `zigordev check` asks for                                                       |
| A short pull request                        | The description holds the table of updates, with no badges and no release notes from elsewhere                                                      | A squash merge turns the description into the commit on `main`                                                       |

Renovate does the merging itself. GitHub's own auto-merge would merge the moment the check is green, at any hour, so the preset switches it off for Renovate. The price is time: Renovate merges on its next run after the check passed, and one pull request per run.

Renovate also keeps one issue open in each repo, the Dependency Dashboard. It lists every update: the open ones, the ones still waiting for their day or their month, and the ones that failed.

## How to use it, with one worked example

A repo needs one file, which `zigordev sync` writes: `renovate.json`.

Take a new patch release of Biome. On its first day nothing happens. On the second day Renovate opens a pull request titled `chore(deps): update dependency @biomejs/biome to v2.6.9`, which changes the one line in the catalog and the lockfile. The pipeline runs on it like on any pull request. If `check` is green and it is a weekday between 08:00 and 18:00, Renovate merges it on its next run. Outside those hours the pull request waits, green, until the window opens.

A major release arrives differently. A month after its release Renovate opens the pull request and leaves it open. A person reads what changed, makes the code fit on that branch if it has to, and merges it.

To change how updates behave, change `renovate/default.json` in `toolkit`. Every repo follows on Renovate's next run. A test in `packages/dev/src/renovate.test.ts` holds the decided values, so a changed decision is a deliberate change there too.

## How to check that it works, and what to do when it does not

| What you see                                                                    | What it means                                                                     | What to do                                                                                        |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| An issue titled "Dependency Dashboard"                                          | Renovate reads the repo and its config is valid                                   | Nothing. It is the place to see what waits                                                        |
| An issue that says the configuration needs fixing                               | The preset or `renovate.json` has an error, and Renovate has stopped              | Fix the file it names. Renovate closes the issue on its next run                                  |
| A green pull request from Renovate that stays open                              | It is outside the window, or Renovate has not run since the check passed          | Wait for the window and for about two hours of it                                                 |
| A red pull request from Renovate                                                | The update breaks the check                                                       | Read the failing job. Fix the code on that branch, or close the pull request to skip that version |
| A pull request from Renovate with a note that the lockfile could not be updated | pnpm refused the new version: it is too new, or its publisher became less trusted | Wait for the next release, or look at why the publisher changed                                   |
| No pull request for a release you know of                                       | It is still inside its day or its month                                           | The Dependency Dashboard lists it as pending                                                      |
