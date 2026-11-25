# @zigordev/dev

The developer setup that every zigordev repo shares: the `zigordev` command, one Biome config, the TypeScript bases, one set of git hooks, one set of commit rules, and the rules that every Claude Code session works under.

## What it is

One command and a handful of files that a repo refers to instead of writing its own.

| Part                    | What it holds                                                                                                                        | A repo refers to it as                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `zigordev`              | The command that checks a repo against the standards, copies the shared files, and holds a product's images to the platform contract | `pnpm exec zigordev`                      |
| `shared/`               | The files that are the same in every repo                                                                                            | Copied into the repo by `zigordev sync`   |
| `biome.json`            | The lint and format rules                                                                                                            | `@zigordev/dev/biome`                     |
| `tsconfig/base.json`    | The strict TypeScript options                                                                                                        | `@zigordev/dev/tsconfig/base.json`        |
| `tsconfig/node.json`    | The base, for code that Node.js runs from `src`                                                                                      | `@zigordev/dev/tsconfig/node.json`        |
| `tsconfig/library.json` | The same, for a package that is compiled before it ships                                                                             | `@zigordev/dev/tsconfig/library.json`     |
| `tsconfig/next.json`    | The base, for a Next.js app                                                                                                          | `@zigordev/dev/tsconfig/next.json`        |
| `lefthook.yml`          | The git hooks                                                                                                                        | `node_modules/@zigordev/dev/lefthook.yml` |
| `commitlint.js`         | The commit rules                                                                                                                     | `@zigordev/dev/commitlint`                |
| `semantic-release.js`   | The release settings, for a repo that publishes packages                                                                             | `@zigordev/dev/semantic-release`          |

## Why we have it

Without it, each repo would keep its own copy of these files, and a rule fixed in one repo would stay broken in the others. With it, a rule changes in one place and reaches every repo as a version update, so the same mistake is caught the same way everywhere.

The command exists for the rules that no ready-made tool checks. A rule that only lives in a document gets broken sooner or later, so each of them is a check with a test.

## How it works here

### The command

`zigordev check` reads the repo and prints one line for each thing that breaks a rule. It ends with code 0 when it finds nothing and with code 1 when it finds something.

| Rule          | What it checks                                                                                                                                                                |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `actions`     | Every action in a workflow is pinned to a commit, with its exact version beside it                                                                                            |
| `attribution` | No commit message, pull request title or pull request description carries an attribution line, such as a `Co-Authored-By` trailer                                             |
| `comments`    | No file holds a comment, in code, config, SQL, Dockerfiles, shell scripts or as a hidden note in Markdown                                                                     |
| `docs`        | The five standard docs exist: `README.md`, the three guides in `docs/` and at least one decision record in `docs/adr/`                                                        |
| `flags`       | Every flag in a `flags.json` carries a removal date, `metadata.removeBy`, and none has passed it                                                                              |
| `identity`    | The repo is set up to commit as zigordev, and every commit that `main` on GitHub does not have yet was made as zigordev                                                       |
| `links`       | Every link from one Markdown file to another file leads somewhere                                                                                                             |
| `migrations`  | A migration that a pull request adds and that deletes data waits for the owner's label `destructive-migration`. In CI it fails without the label. On the laptop it only warns |
| `scripts`     | `package.json` has the standard scripts, and the local stack scripts too when the repo has a `compose.yaml`                                                                   |
| `shared`      | Every shared file in the repo matches the copy in this package                                                                                                                |

The `migrations` rule reads each SQL file in a `drizzle/` folder that is new: one that the pull request adds in CI, or one that `origin/main` lacks on the laptop. It finds the statements that delete data: `DROP TABLE`, `DROP COLUMN`, `DROP SCHEMA`, `DROP DATABASE`, `TRUNCATE`, `DELETE` and a change of a column's type. `DROP INDEX`, `DROP CONSTRAINT`, `DROP DEFAULT` and `DROP NOT NULL` lose no data, so they pass. In a pull request it fails until the pull request has the label `destructive-migration`, which only the owner adds, and the pipeline runs again when a label changes. In a pull request it reads the merge commit against its first parent, so it needs the merge of the pull request and the whole history, and it fails when the checkout lacks them. On the laptop it cannot see labels, so it prints a warning and does not stop the commit. [Record 0037](../../docs/adr/0037-a-migration-that-deletes-data-waits-for-the-owners-label.md) holds the decision.

The `flags` rule reads every `flags.json` of the repo, the files that [`@zigordev/flags`](../flags/README.md) reads in each app. A flag needs `metadata.removeBy` as a real date, `YYYY-MM-DD`, and fails from the day after that date, in UTC. The finding names the file and the line of the flag. The fix is to remove the flag and the code that asks for it, or to move the date in a pull request that says why. [Record 0046](../../docs/adr/0046-each-app-reads-its-own-flags-in-the-app.md) holds the decision.

The `identity` and `attribution` rules make one exception for a text changed in Fink, the web editor for translators, as [record 0048](../../docs/adr/0048-a-text-changed-in-fink-keeps-its-translator-as-author.md) says. A commit that changes only files named `<language>.json` in a `messages/` folder may have another author and committer, and may carry the co-author line that Fink adds to each commit, for Fink at its inlang.com address. When every commit of a pull request is such a commit, its description may carry that line too. A commit that changes any other file is held to both rules as usual.

The `comments` rule allows the few lines a tool needs to work: the first line of a script that names its interpreter, the version beside a pinned action, a Dockerfile's `syntax` line, and suppressions such as `biome-ignore` and `@ts-expect-error`. It reads code with a small scanner of its own, which knows strings, template literals and regular expressions. It does not look inside the code blocks of a Markdown file. It skips the two lock files that a tool writes and rewrites, `pnpm-lock.yaml` and OpenTofu's `.terraform.lock.hcl`, whose header `tofu init` puts back on every change of providers.

The `identity` rule accepts two more names: Renovate as the author of its own updates, and GitHub as the committer of a merge it made.

The `attribution` rule accepts one line, and only on a commit whose author is Renovate: `Co-authored-by: renovate[bot] <29139614+renovate[bot]@users.noreply.github.com>`. GitHub adds that line by itself when it squashes a pull request that Renovate opened, and nothing can take it out of a commit that is on `main`. The line has to read exactly so. The same line on a commit of anyone else, any other co-author on a commit of Renovate, and that line in a pull request's title or description are findings as before.

`zigordev sync` copies the shared files from this package into the repo and says which ones it changed. They are the files that must read the same everywhere: `lefthook.yml`, `.commitlintrc.json`, `.markdownlint-cli2.jsonc`, `renovate.json`, the pull request template under `.github/` and the session rules under `.claude/`. When this package changes one of them, the `shared` rule fails in every repo until `zigordev sync` has run there, so no copy can fall behind unnoticed.

The root `biome.json` is not among them. Biome refuses a second root config anywhere in a repo, so this package cannot hold a copy of it.

### The release command

A repo that publishes packages runs two more commands in its pipeline. They hold the one part of a release that no ready-made tool does for us: knowing which packages still have to be published.

`zigordev release plan` looks at three things: the packages of the workspace that are not marked private, the newest version tag in git, and npm. It prints each package that npm does not have at that version, and it tells the pipeline whether anything is left to publish.

`zigordev release pack <folder> <version>` writes that version into the manifest of every public package, and packs the missing ones as tarballs into the folder. pnpm does the packing, so a tarball holds exact versions where the repo says `catalog:` or `workspace:`.

Both ask npm through its own command. Any answer other than "found" or "not found" stops the release, so a network fault never looks like a missing package.

The plan starts from what npm lacks, not from what just changed. A release that failed halfway therefore finishes on the next run.

npm needs a few minutes to show a version after it has taken it. With `--settle <seconds>`, the plan gives npm that long before it calls a version missing, so that a second run does not publish what the first one has just handed in.

`semantic-release.js` holds the settings of semantic-release, the tool that works out the next version. It releases from `main` only, reads a title the way commitlint does, with `!` after the type as a breaking change, and writes the release notes on GitHub. It posts no comment, opens no issue and adds no label, because nothing here credits a tool. It does not publish: the pipeline does that with the two commands above.

`zigordev first-publish <package...>` is for the owner of the npm account, once for each new package. npm lets a pipeline publish a package only when the package exists and its name is tied to the repo, and a new tie expires unless the pipeline publishes through it within 2 days. The command does both steps: it publishes an empty version 0.0.0 from a throwaway folder, and it ties the name to this repo, to its `ci.yml` and to the environment named `release`. It works through the owner's own sign-in and second factor, so it refuses to run without a person at a terminal. With `--dry-run` it only says what it would do.

A repo's own `release.config.js` passes these settings on in one line. semantic-release then finds its own plugins, which it cannot do when the settings arrive through its `extends` option under pnpm.

### The contract command

Every app on the platform keeps twelve promises, and [The platform](../../docs/handbook/the-platform.md) lists them. The first six are about how an app behaves while it runs, so no reading of its code can show them. `zigordev contract` checks those six on the images themselves. It also checks promise 7, that the product describes itself in its compose files, as far as the deploy and the backup depend on it: the rules that [Delivery](../../docs/handbook/delivery.md) lists, and that each app the ingress routes drains before it stops.

It runs in the folder of a product, where `compose.yaml` is. An app is a service whose image begins with `ghcr.io/zigordev/`, and its image has to be built already. A service with the label `com.zigordev.job`, such as a migration job on the app's own image, is a job and not an app: it runs once and ends. [Record 0035](../../docs/adr/0035-labels-tell-the-platform-what-a-service-is.md) sets the label.

The command starts the product once more, under the name `<product>-contract` and on a network of its own. Nothing of it touches a product that already runs on the laptop, or the shared services. In place of the telemetry agent it starts a stand-in: one small script in a Node.js container, under the name and the port that `compose.yaml` gives the apps. The stand-in records what the apps send. Every request to an app is also made from there, so no port is published.

| #   | The promise                                           | What the command does to see it                                                                                                                                                                                                                                                 |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | An arm64 image that runs as a non-root user           | It reads the architecture of the image and the user of the running container                                                                                                                                                                                                    |
| 2   | Settings from the environment, checked at start       | It starts the image with no settings and no network. The app must stop within 15 seconds, with a code that is not 0                                                                                                                                                             |
| 3   | Listens on `PORT`, and answers `GET /health`          | It asks `/health` on the port that `compose.yaml` names. Then it starts a second copy with another `PORT`, and asks there. Both must answer 200 with a status of `ok` or `degraded`. The first answer must name the app's `OTEL_SERVICE_VERSION` as `version`                   |
| 4   | JSON lines on standard output, with no personal data  | It visits the app twice as a visitor would, with an address, a user agent, an email and a code. Every line the container printed must then be a JSON object, with none of the four in it                                                                                        |
| 5   | Traces and metrics over OTLP, under its own name      | Both must reach the stand-in within 20 seconds, under the name of the compose service, and with none of the four in them                                                                                                                                                        |
| 6   | A clean stop within 30 seconds of a SIGTERM           | It begins a request to `/health` and holds it half sent. Then it stops the container. The app must still answer that request, and end by itself with code 0 or 143                                                                                                              |
| 7   | It drains before it stops, when the ingress routes it | It runs the app's own health check, writes `/tmp/drain` in the container as the user of the container, runs the check again, removes the file and runs it once more. The check must pass, fail, and pass again. That is what docker-rollout does to the old version on a deploy |

For promise 4, nothing may be on the error output either. For the run, the command sets `OTEL_METRIC_EXPORT_INTERVAL` to one second and `OTEL_BSP_SCHEDULE_DELAY` to half a second, so that the telemetry arrives while it waits. Both are standard variables of OpenTelemetry. Code 143 is how a process says that a SIGTERM ended it, and Next.js ends that way after it has finished its requests.

The rules of the compose files are read without starting anything, from `compose.yaml` and `compose.production.yaml` together, as the host reads them, with their variables left as written. `.env.production.example` is read beside them.

| The rule of promise 7                      | What the command reads                                                                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The product has one name                   | A line `name: <product>` at the top of `compose.yaml`                                                                                                                    |
| Our images follow `VERSION`                | Every image of `ghcr.io/zigordev/` is `<product>-<part>:${VERSION:-local}`, and every service that runs one has `OTEL_SERVICE_VERSION: ${VERSION:-local}`                |
| Every other image is pinned by its digest  | It is written `name:tag@sha256:<digest>`                                                                                                                                 |
| Services restart after the night's restart | Every long-running service has `restart: unless-stopped`, and a job has `restart: "no"`                                                                                  |
| A routed service can drain                 | No `container_name` and no `ports`. Its health check names `/tmp/drain`, `/tmp` is in memory, and the label `docker-rollout.pre-stop-hook` waits long enough             |
| The secrets are named, and only named      | Each line of `.env.production.example` is `NAME=`, and every variable of the compose files is one of them, but `VERSION` and `DOCKER_SOCKET_GROUP`, which the host gives |
| Production has its address                 | Every routed service has a router rule with ``Host(`<product>.zigordev.com`)`` in `compose.production.yaml`                                                              |
| The backup finds every database            | Every service on the official `postgres` image has the label `com.zigordev.backup: postgres`, and no service names another kind in that label                            |

It prints one line for each rule of the compose files, then one for each promise of each app, with what it saw:

```text
the compose files
  kept    7  compose.yaml names the product template, which is its project's name on the host
  kept    7  every long-running service restarts unless stopped, and a job never does
template-api
  kept    1  an arm64 image that runs as the user 1000:1000
  kept    2  without its settings it stops at once, with code 1
  kept    3  it listens on the port in PORT, and answers GET /health with 200 and its version local
  kept    4  6 lines, all JSON, with nothing a visitor sent
  kept    5  traces and metrics reached the agent under the name template-api
  kept    6  it stopped 1.3 s after a SIGTERM with code 0, and answered the request it had begun
  kept    7  its health check fails while /tmp/drain exists, and passes again once it is gone
zigordev contract: 1 app keeps promises 1 to 7, and the compose files keep promise 7
```

The example leaves out six of the eight lines of the compose files.

A job keeps two promises of its own, and gets the same kind of lines under its name:

| #   | The promise of a job                      | What the command does to see it                                                                                                                          |
| --- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | It ends with code 0 before its app starts | It reads the job's state once the product has started. A service has to wait for it with `depends_on` and the condition `service_completed_successfully` |
| 2   | Every line it prints is JSON              | Every line on both of its outputs must be a JSON object                                                                                                  |

```text
template-api-migrate, a job
  kept    1  it ended with code 0 before template-api started
  kept    2  3 lines, all JSON
zigordev contract: 2 apps keep promises 1 to 7, the compose files keep promise 7, and 1 job keeps promises 1 and 2
```

When a job fails, its app never starts, and the command says that the product did not start, with the last lines of Compose, which name the job.

It ends with code 0 when every promise is kept and with code 1 when one is broken. Either way it removes everything it started. Two apps that keep the contract take about 25 seconds. An app that breaks it takes longer, up to a minute more, because the command waits before it gives up.

### The session rules

Claude Code does the building in every repo, and `shared/.claude/` holds what it works under. `zigordev sync` copies the folder into each repo, so a session finds the same rules everywhere, in a cloud session too.

| Part                                                                                   | What it holds                                                                                                                                   | When a session reads it                                                            |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `rules/core.md`                                                                        | The few rules that hold everywhere, and the check that enforces each one                                                                        | Always                                                                             |
| `rules/api.md`, `web.md`, `data.md`, `infra.md`, `workflows.md`, `docs.md`, `tests.md` | The standards of one area                                                                                                                       | Only when it reads or edits a file of that area, such as a migration for `data.md` |
| `skills/`                                                                              | Procedures done the same way each time: `start-work`, `finish-work`, `write-decision-record`, `add-endpoint`, `add-migration` and `new-product` | Only when it uses one                                                              |
| `settings.json`                                                                        | The permission rules and the two hooks                                                                                                          | Always                                                                             |
| `hooks/`                                                                               | The guard: `guard.sh` and `guard.mjs`                                                                                                           | Before every shell command, and after a file is written                            |

The permission rules are three plain lists. One lets the standard scripts run without a question, such as `pnpm check`. One asks the owner first: creating or changing a repo, a release, a label or a workflow run, applying infrastructure, and publishing a package. One refuses outright: setting or deleting a secret or a variable.

The guard answers what a list cannot, because it has to look at the repo or at the text of the command:

| The session tries to                                                                                   | The guard                                                    |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Commit under an identity other than zigordev                                                           | Refuses, and says how to set the identity                    |
| Commit, or send text with `gh`, with an attribution line in it                                         | Refuses                                                      |
| Push to `main`, however the command spells it                                                          | Refuses                                                      |
| Push, or change something with `gh`, while `gh` acts as another account                                | Refuses, and names the command that switches                 |
| Approve a pull request or a deployment, or merge with `--admin`                                        | Refuses                                                      |
| Skip the git hooks, force-push another branch, change a label, or change anything through GitHub's API | Asks the owner                                               |
| Write a file that holds a comment                                                                      | Lets it happen, then tells the session to remove the comment |

The guard applies the identity, push and account checks only in a zigordev repo, which it knows by the repo's remote or by the repo's own copy of the guard. The attribution check applies in every repo.

`guard.sh` is a launcher of seven lines. Starting Node.js takes between 110 and 190 ms on the laptop, and the hook runs before every shell command. So the launcher looks at the command first, and starts `guard.mjs` only when the command names `git` or `gh`, or when a file was written. Every other command gets its answer in under 10 ms.

`guard.mjs` has no dependency and runs on any Node.js from version 20, so it works before `pnpm install` and in a folder that pins no Node.js version. The check for comments after a write is the exception: it runs the installed `zigordev` command, and it is skipped while that is missing.

The hook is set to block when it fails. A session cannot commit or push while the guard is broken or Node.js is missing, and every other command still runs.

### The git hooks

| When                               | What runs                    | What it does                                                                                                                            |
| ---------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Before a commit                    | Biome                        | Lints and formats the staged TypeScript, JavaScript, JSON and CSS files, formats the staged YAML and Markdown, and stages what it fixed |
| Before a commit                    | markdownlint                 | Refuses staged Markdown that breaks a rule                                                                                              |
| Before a commit                    | gitleaks                     | Refuses a staged change that contains something shaped like a secret                                                                    |
| Before a commit                    | `zigordev check comments`    | Refuses a staged file that holds a comment                                                                                              |
| Before a commit                    | `zigordev check identity`    | Refuses a commit that would not be made as zigordev                                                                                     |
| When the commit message is written | commitlint                   | Refuses a title that is not a Conventional Commit, and any attribution line                                                             |
| Before a push                      | A check on the target branch | Refuses a push to `main`                                                                                                                |
| Before a push                      | `pnpm check:quick`           | Runs the part of the check that needs no containers                                                                                     |

lefthook skips the push hooks when a push carries no changed file. Such a push to `main` is still refused by GitHub, where the rule on `main` cannot be bypassed.

The same files serve the laptop and the pipeline, and nothing here runs in production.

### The pull request template

`shared/.github/pull_request_template.md` is the description that a pull request starts with when someone opens it on GitHub's site. It has six sections, and one line under each that says what belongs there:

| Section           | What the author writes                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| What              | What the pull request changes                                                                       |
| Why               | Why the change is needed, and why it is done this way                                               |
| How it was tested | What was run and what was seen, and what was not tested                                             |
| Observability     | How the change shows when it runs: its logs, metrics, traces and alerts. Or that nothing of it runs |
| Docs              | Which docs changed with the behaviour, or why none had to                                           |
| Follow-ups        | What is left for later                                                                              |

A squash merge turns the title and the description into the commit on `main`. So the author replaces each line with their own words, and every commit on `main` then reads the same way. The lines are plain text and not hidden notes: a hidden note is a comment, and it would land in the commit too.

The template fills in the form on GitHub's site, and nothing else. A session passes its own description to `gh`, with the same six sections, as the `finish-work` skill says. Renovate writes its own short description. A test holds the template and the skill to the same sections, in the same order.

markdownlint leaves the file out. A description starts with a second-level heading, and markdownlint expects a file to start with a top-level one.

### The configs

Biome reads the YAML block at the top of a Markdown file as front matter, because every rule and skill file starts with one. The Biome rules are Biome's recommended set plus three: no `console`, type-only imports written as `import type`, and Node.js built-ins imported with the `node:` prefix. Code is formatted with two spaces, single quotes, semicolons and lines of up to 100 characters. Biome leaves alone what a tool generates into a folder named `src/generated`, so that the generated file stays exactly as its generator wrote it.

The TypeScript base turns on strict mode and three checks beyond it: a value read by index may be `undefined`, an override must be marked, and a `switch` case may not fall through. It also accepts only the syntax that Node.js can strip, because Node.js runs the `.ts` files directly.

The base for a Next.js app adds the browser's types and JSX, resolves modules the way a bundler does, and writes no output, because Next.js compiles the app itself. It also names the folders where Next.js writes its own types. Next.js adds those to a `tsconfig.json` by itself, but never to one that extends another file.

## How to use it

Add the package and the tools it drives as dev dependencies: `@zigordev/dev`, `@biomejs/biome`, `@commitlint/cli`, `lefthook`, `markdownlint-cli2` and `typescript`. gitleaks is not an npm package, so pin it in `mise.toml`.

Then let the command write the shared files:

```bash
pnpm exec zigordev sync
```

Two files stay yours to write, because each repo may add to them.

`biome.json`:

```json
{
  "root": true,
  "extends": ["@zigordev/dev/biome"]
}
```

`tsconfig.json`:

```json
{
  "extends": "@zigordev/dev/tsconfig/base.json",
  "compilerOptions": {
    "noEmit": true
  }
}
```

Last, two scripts in `package.json`. `"prepare": "lefthook install"` makes `pnpm install` install the hooks, and the lint script ends with `zigordev check`, so the pipeline runs every rule.

To run the command by hand:

```bash
pnpm exec zigordev check
pnpm exec zigordev check comments links
pnpm exec zigordev check comments src/app.ts
pnpm exec zigordev sync
pnpm exec zigordev release plan
pnpm exec zigordev first-publish --dry-run @zigordev/dev
pnpm exec zigordev contract
```

The first line runs every rule. The second runs two of them. The third reads one file only. The fourth brings the shared files up to date. The fifth says which public packages npm lacks at the latest version, and it changes nothing. The sixth says what the first publish of a package would do, and changes nothing either. The seventh holds the product of the folder to the contract. It needs Docker running, and the product's images built.

## How to check that it works

| Try this                                                                 | What must happen                                                                       |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Stage a badly formatted `.ts` file and commit                            | The commit goes through with the file formatted                                        |
| Stage a Markdown file with two top-level headings                        | The commit is refused, and markdownlint names the rule                                 |
| Stage a file that holds something shaped like a secret                   | The commit is refused, and gitleaks reports one leak                                   |
| Stage a file that holds a comment                                        | The commit is refused, and `zigordev` names the file and the line                      |
| Commit with the message `added things`                                   | The commit is refused, because the title has no type                                   |
| Link to a file that does not exist, then run `pnpm check`                | The check fails, and `zigordev` names the link                                         |
| Change a line in `lefthook.yml`, then run `pnpm check`                   | The check fails and asks for `zigordev sync`, which puts the file back                 |
| Push a branch                                                            | `pnpm check:quick` runs first, and the push waits for it                               |
| Push a commit to `main`                                                  | The push is refused before it leaves the laptop                                        |
| Push a branch and open a pull request for it on GitHub's site            | The description starts with the six sections, from What to Follow-ups                  |
| Run `pnpm exec zigordev release plan` in a repo with no version tag      | It says how many packages are public, and that no version is tagged yet                |
| Run `pnpm exec zigordev first-publish --dry-run` with a package's name   | It says whether the name is new on npm, and prints the command that would tie it       |
| Run `pnpm exec zigordev contract` in the template, with its images built | It prints six lines for each app, and ends with code 0 when each says `kept`           |
| Make an app print a line of plain text, build it, and run it again       | Promise 4 of that app says `broken`, and quotes the line                               |
| In a session, commit while the repo is set up to commit as someone else  | The commit is refused before git runs, and the session is told how to set the identity |
| In a session, write a file that holds a comment                          | The file is written, and the session is told to remove the comment                     |
| In a session, read a migration, then run `/context`                      | `data.md` is among the loaded rules. Before that, it is not                            |

When a session reports that a hook failed and blocked a git command, Node.js is missing from its path or `.claude/hooks/` is incomplete: run `mise install`, then `pnpm exec zigordev sync`.

When a hook does not run at all, the hooks are not installed: run `pnpm install`, which ends with `sync hooks` and the three hook names. When gitleaks is reported as missing, run `mise install`.

When `zigordev` reports a comment where there is none, the scanner misread the file. It is a bug in this package, and the place to fix it is `src/rules/comments.ts`, with a test that shows the case.
