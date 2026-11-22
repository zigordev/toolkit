# @zigordev/dev

The developer setup that every zigordev repo shares: one Biome config, one TypeScript base, one set of git hooks and one set of commit rules.

## What it is

Four files that a repo refers to instead of writing its own.

| File                 | What it holds                 | A repo refers to it as                    |
| -------------------- | ----------------------------- | ----------------------------------------- |
| `biome.json`         | The lint and format rules     | `@zigordev/dev/biome`                     |
| `tsconfig/base.json` | The strict TypeScript options | `@zigordev/dev/tsconfig/base.json`        |
| `lefthook.yml`       | The git hooks                 | `node_modules/@zigordev/dev/lefthook.yml` |
| `commitlint.js`      | The commit rules              | `@zigordev/dev/commitlint`                |

## Why we have it

Without it, each repo would keep its own copy of these files, and a rule fixed in one repo would stay broken in the others. With it, a rule changes in one place and reaches every repo as a version update, so the same mistake is caught the same way everywhere.

## How it works here

The files do nothing by themselves. The tools below read them on the laptop, and the pipeline will run the same tools with the same files. Nothing here runs in production.

| When                               | What runs                    | What it does                                                                                                                            |
| ---------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Before a commit                    | Biome                        | Lints and formats the staged TypeScript, JavaScript, JSON and CSS files, formats the staged YAML and Markdown, and stages what it fixed |
| Before a commit                    | markdownlint                 | Refuses staged Markdown that breaks a rule                                                                                              |
| Before a commit                    | gitleaks                     | Refuses a staged change that contains something shaped like a secret                                                                    |
| When the commit message is written | commitlint                   | Refuses a title that is not a Conventional Commit, and any attribution line                                                             |
| Before a push                      | A check on the target branch | Refuses a push to `main`                                                                                                                |
| Before a push                      | `pnpm check:quick`           | Runs the part of the check that needs no containers                                                                                     |

lefthook skips the push hooks when a push carries no changed file. Such a push to `main` is still refused by GitHub, where the rule on `main` cannot be bypassed.

The Biome rules are Biome's recommended set plus three: no `console`, type-only imports written as `import type`, and Node.js built-ins imported with the `node:` prefix. Code is formatted with two spaces, single quotes, semicolons and lines of up to 100 characters.

The TypeScript base turns on strict mode and three checks beyond it: a value read by index may be `undefined`, an override must be marked, and a `switch` case may not fall through. It also accepts only the syntax that Node.js can strip, because Node.js runs the `.ts` files directly.

## How to use it

Add the package and the tools it drives as dev dependencies: `@zigordev/dev`, `@biomejs/biome`, `@commitlint/cli`, `lefthook`, `markdownlint-cli2` and `typescript`. gitleaks is not an npm package, so pin it in `mise.toml`. Then point four small files at the package.

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

`lefthook.yml`:

```yaml
extends:
  - node_modules/@zigordev/dev/lefthook.yml
```

`.commitlintrc.json`:

```json
{
  "extends": ["@zigordev/dev/commitlint"]
}
```

Last, add `"prepare": "lefthook install"` to the scripts of `package.json`, so `pnpm install` installs the hooks.

## How to check that it works

| Try this                                               | What must happen                                         |
| ------------------------------------------------------ | -------------------------------------------------------- |
| Stage a badly formatted `.ts` file and commit          | The commit goes through with the file formatted          |
| Stage a Markdown file with two top-level headings      | The commit is refused, and markdownlint names the rule   |
| Stage a file that holds something shaped like a secret | The commit is refused, and gitleaks reports one leak     |
| Commit with the message `added things`                 | The commit is refused, because the title has no type     |
| Push a branch                                          | `pnpm check:quick` runs first, and the push waits for it |
| Push a commit to `main`                                | The push is refused before it leaves the laptop          |

When a hook does not run at all, the hooks are not installed: run `pnpm install`, which ends with `sync hooks` and the three hook names. When gitleaks is reported as missing, run `mise install`.
