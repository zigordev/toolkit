# @zigordev/dev

The developer setup that every zigordev repo shares: the `zigordev` command, one Biome config, the TypeScript bases, one set of git hooks, one set of commit rules, and the rules that every Claude Code session works under.

## What it is

One command and a handful of files that a repo refers to instead of writing its own.

| Part                    | What it holds                                                                    | A repo refers to it as                    |
| ----------------------- | -------------------------------------------------------------------------------- | ----------------------------------------- |
| `zigordev`              | The command that checks a repo against the standards and copies the shared files | `pnpm exec zigordev`                      |
| `shared/`               | The files that are the same in every repo                                        | Copied into the repo by `zigordev sync`   |
| `biome.json`            | The lint and format rules                                                        | `@zigordev/dev/biome`                     |
| `tsconfig/base.json`    | The strict TypeScript options                                                    | `@zigordev/dev/tsconfig/base.json`        |
| `tsconfig/node.json`    | The base, for code that Node.js runs from `src`                                  | `@zigordev/dev/tsconfig/node.json`        |
| `tsconfig/library.json` | The same, for a package that is compiled before it ships                         | `@zigordev/dev/tsconfig/library.json`     |
| `lefthook.yml`          | The git hooks                                                                    | `node_modules/@zigordev/dev/lefthook.yml` |
| `commitlint.js`         | The commit rules                                                                 | `@zigordev/dev/commitlint`                |
| `semantic-release.js`   | The release settings, for a repo that publishes packages                         | `@zigordev/dev/semantic-release`          |

## Why we have it

Without it, each repo would keep its own copy of these files, and a rule fixed in one repo would stay broken in the others. With it, a rule changes in one place and reaches every repo as a version update, so the same mistake is caught the same way everywhere.

The command exists for the rules that no ready-made tool checks. A rule that only lives in a document gets broken sooner or later, so each of them is a check with a test.

## How it works here

### The command

`zigordev check` reads the repo and prints one line for each thing that breaks a rule. It ends with code 0 when it finds nothing and with code 1 when it finds something.

| Rule          | What it checks                                                                                                                    |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `actions`     | Every action in a workflow is pinned to a commit, with its exact version beside it                                                |
| `attribution` | No commit message, pull request title or pull request description carries an attribution line, such as a `Co-Authored-By` trailer |
| `comments`    | No file holds a comment, in code, config, SQL, Dockerfiles, shell scripts or as a hidden note in Markdown                         |
| `docs`        | The five standard docs exist: `README.md`, the three guides in `docs/` and at least one decision record in `docs/adr/`            |
| `identity`    | The repo is set up to commit as zigordev, and every commit that `main` on GitHub does not have yet was made as zigordev           |
| `links`       | Every link from one Markdown file to another file leads somewhere                                                                 |
| `scripts`     | `package.json` has the standard scripts, and the local stack scripts too when the repo has a `compose.yaml`                       |
| `shared`      | Every shared file in the repo matches the copy in this package                                                                    |

The `comments` rule allows the few lines a tool needs to work: the first line of a script that names its interpreter, the version beside a pinned action, a Dockerfile's `syntax` line, and suppressions such as `biome-ignore` and `@ts-expect-error`. It reads code with a small scanner of its own, which knows strings, template literals and regular expressions. It does not look inside the code blocks of a Markdown file.

The `identity` rule accepts two more names: Renovate as the author of its own updates, and GitHub as the committer of a merge it made.

`zigordev sync` copies the shared files from this package into the repo and says which ones it changed. They are the files that must read the same everywhere: `lefthook.yml`, `.commitlintrc.json`, `.markdownlint-cli2.jsonc`, `renovate.json`, the pull request template under `.github/` and the session rules under `.claude/`. When this package changes one of them, the `shared` rule fails in every repo until `zigordev sync` has run there, so no copy can fall behind unnoticed.

The root `biome.json` is not among them. Biome refuses a second root config anywhere in a repo, so this package cannot hold a copy of it.

### The release command

A repo that publishes packages runs two more commands in its pipeline. They hold the one part of a release that no ready-made tool does for us: knowing which packages still have to be published.

`zigordev release plan` looks at three things: the packages of the workspace that are not marked private, the newest version tag in git, and npm. It prints each package that npm does not have at that version, and it tells the pipeline whether anything is left to publish.

`zigordev release pack <folder> <version>` writes that version into the manifest of every public package, and packs the missing ones as tarballs into the folder. pnpm does the packing, so a tarball holds exact versions where the repo says `catalog:` or `workspace:`.

Both ask npm through its own command. Any answer other than "found" or "not found" stops the release, so a network fault never looks like a missing package.

The plan starts from what npm lacks, not from what just changed. A release that failed halfway therefore finishes on the next run.

`semantic-release.js` holds the settings of semantic-release, the tool that works out the next version. It releases from `main` only, reads a title the way commitlint does, with `!` after the type as a breaking change, and writes the release notes on GitHub. It posts no comment, opens no issue and adds no label, because nothing here credits a tool. It does not publish: the pipeline does that with the two commands above.

A repo's own `release.config.js` passes these settings on in one line. semantic-release then finds its own plugins, which it cannot do when the settings arrive through its `extends` option under pnpm.

### The session rules

Claude Code does the building in every repo, and `shared/.claude/` holds what it works under. `zigordev sync` copies the folder into each repo, so a session finds the same rules everywhere, in a cloud session too.

| Part                                                                                   | What it holds                                                                                   | When a session reads it                                                            |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `rules/core.md`                                                                        | The few rules that hold everywhere, and the check that enforces each one                        | Always                                                                             |
| `rules/api.md`, `web.md`, `data.md`, `infra.md`, `workflows.md`, `docs.md`, `tests.md` | The standards of one area                                                                       | Only when it reads or edits a file of that area, such as a migration for `data.md` |
| `skills/`                                                                              | Procedures done the same way each time: `start-work`, `finish-work` and `write-decision-record` | Only when it uses one                                                              |
| `settings.json`                                                                        | The permission rules and the two hooks                                                          | Always                                                                             |
| `hooks/`                                                                               | The guard: `guard.sh` and `guard.mjs`                                                           | Before every shell command, and after a file is written                            |

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

Biome reads the YAML block at the top of a Markdown file as front matter, because every rule and skill file starts with one. The Biome rules are Biome's recommended set plus three: no `console`, type-only imports written as `import type`, and Node.js built-ins imported with the `node:` prefix. Code is formatted with two spaces, single quotes, semicolons and lines of up to 100 characters.

The TypeScript base turns on strict mode and three checks beyond it: a value read by index may be `undefined`, an override must be marked, and a `switch` case may not fall through. It also accepts only the syntax that Node.js can strip, because Node.js runs the `.ts` files directly.

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
```

The first line runs every rule. The second runs two of them. The third reads one file only. The fourth brings the shared files up to date. The fifth says which public packages npm lacks at the latest version, and it changes nothing.

## How to check that it works

| Try this                                                                | What must happen                                                                       |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Stage a badly formatted `.ts` file and commit                           | The commit goes through with the file formatted                                        |
| Stage a Markdown file with two top-level headings                       | The commit is refused, and markdownlint names the rule                                 |
| Stage a file that holds something shaped like a secret                  | The commit is refused, and gitleaks reports one leak                                   |
| Stage a file that holds a comment                                       | The commit is refused, and `zigordev` names the file and the line                      |
| Commit with the message `added things`                                  | The commit is refused, because the title has no type                                   |
| Link to a file that does not exist, then run `pnpm check`               | The check fails, and `zigordev` names the link                                         |
| Change a line in `lefthook.yml`, then run `pnpm check`                  | The check fails and asks for `zigordev sync`, which puts the file back                 |
| Push a branch                                                           | `pnpm check:quick` runs first, and the push waits for it                               |
| Push a commit to `main`                                                 | The push is refused before it leaves the laptop                                        |
| Push a branch and open a pull request for it on GitHub's site           | The description starts with the six sections, from What to Follow-ups                  |
| Run `pnpm exec zigordev release plan` in a repo with no version tag     | It says how many packages are public, and that no version is tagged yet                |
| In a session, commit while the repo is set up to commit as someone else | The commit is refused before git runs, and the session is told how to set the identity |
| In a session, write a file that holds a comment                         | The file is written, and the session is told to remove the comment                     |
| In a session, read a migration, then run `/context`                     | `data.md` is among the loaded rules. Before that, it is not                            |

When a session reports that a hook failed and blocked a git command, Node.js is missing from its path or `.claude/hooks/` is incomplete: run `mise install`, then `pnpm exec zigordev sync`.

When a hook does not run at all, the hooks are not installed: run `pnpm install`, which ends with `sync hooks` and the three hook names. When gitleaks is reported as missing, run `mise install`.

When `zigordev` reports a comment where there is none, the scanner misread the file. It is a bug in this package, and the place to fix it is `src/rules/comments.ts`, with a test that shows the case.
