# @zigordev/dev

The developer setup that every zigordev repo shares: the `zigordev` command, one Biome config, the TypeScript bases, one set of git hooks and one set of commit rules.

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

## Why we have it

Without it, each repo would keep its own copy of these files, and a rule fixed in one repo would stay broken in the others. With it, a rule changes in one place and reaches every repo as a version update, so the same mistake is caught the same way everywhere.

The command exists for the rules that no ready-made tool checks. A rule that only lives in a document gets broken sooner or later, so each of them is a check with a test.

## How it works here

### The command

`zigordev check` reads the repo and prints one line for each thing that breaks a rule. It ends with code 0 when it finds nothing and with code 1 when it finds something.

| Rule       | What it checks                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| `actions`  | Every action in a workflow is pinned to a commit, with its exact version beside it                                      |
| `comments` | No file holds a comment, in code, config, SQL, Dockerfiles, shell scripts or as a hidden note in Markdown               |
| `docs`     | The five standard docs exist: `README.md`, the three guides in `docs/` and at least one decision record in `docs/adr/`  |
| `identity` | The repo is set up to commit as zigordev, and every commit that `main` on GitHub does not have yet was made as zigordev |
| `links`    | Every link from one Markdown file to another file leads somewhere                                                       |
| `scripts`  | `package.json` has the standard scripts, and the local stack scripts too when the repo has a `compose.yaml`             |
| `shared`   | Every shared file in the repo matches the copy in this package                                                          |

The `comments` rule allows the few lines a tool needs to work: the first line of a script that names its interpreter, the version beside a pinned action, a Dockerfile's `syntax` line, and suppressions such as `biome-ignore` and `@ts-expect-error`. It reads code with a small scanner of its own, which knows strings and template literals. It does not look inside the code blocks of a Markdown file.

The `identity` rule accepts two more names: Renovate as the author of its own updates, and GitHub as the committer of a merge it made.

`zigordev sync` copies the shared files from this package into the repo and says which ones it changed. They are the files that must read the same everywhere: `lefthook.yml`, `.commitlintrc.json` and `.markdownlint-cli2.jsonc`. When this package changes one of them, the `shared` rule fails in every repo until `zigordev sync` has run there, so no copy can fall behind unnoticed.

The root `biome.json` is not among them. Biome refuses a second root config anywhere in a repo, so this package cannot hold a copy of it.

### The hooks

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

### The configs

The Biome rules are Biome's recommended set plus three: no `console`, type-only imports written as `import type`, and Node.js built-ins imported with the `node:` prefix. Code is formatted with two spaces, single quotes, semicolons and lines of up to 100 characters.

The TypeScript base turns on strict mode and three checks beyond it: a value read by index may be `undefined`, an override must be marked, and a `switch` case may not fall through. It also accepts only the syntax that Node.js can strip, because Node.js runs the `.ts` files directly.

## How to use it

Add the package and the tools it drives as dev dependencies: `@zigordev/dev`, `@biomejs/biome`, `@commitlint/cli`, `lefthook`, `markdownlint-cli2` and `typescript`. gitleaks is not an npm package, so pin it in `mise.toml`.

Then let the command write the three shared files:

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
```

The first line runs every rule. The second runs two of them. The third reads one file only. The fourth brings the shared files up to date.

## How to check that it works

| Try this                                                  | What must happen                                                       |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| Stage a badly formatted `.ts` file and commit             | The commit goes through with the file formatted                        |
| Stage a Markdown file with two top-level headings         | The commit is refused, and markdownlint names the rule                 |
| Stage a file that holds something shaped like a secret    | The commit is refused, and gitleaks reports one leak                   |
| Stage a file that holds a comment                         | The commit is refused, and `zigordev` names the file and the line      |
| Commit with the message `added things`                    | The commit is refused, because the title has no type                   |
| Link to a file that does not exist, then run `pnpm check` | The check fails, and `zigordev` names the link                         |
| Change a line in `lefthook.yml`, then run `pnpm check`    | The check fails and asks for `zigordev sync`, which puts the file back |
| Push a branch                                             | `pnpm check:quick` runs first, and the push waits for it               |
| Push a commit to `main`                                   | The push is refused before it leaves the laptop                        |

When a hook does not run at all, the hooks are not installed: run `pnpm install`, which ends with `sync hooks` and the three hook names. When gitleaks is reported as missing, run `mise install`.

When `zigordev` reports a comment where there is none, the scanner misread the file. It is a bug in this package, and the place to fix it is `src/rules/comments.ts`, with a test that shows the case.
