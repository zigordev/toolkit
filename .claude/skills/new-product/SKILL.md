---
name: new-product
description: Make a new product, or a new shared service, from the template in toolkit. Gets the owner's yes, creates the repo, copies the template at one release with every name changed, makes the hand edits for a product with only an API, installs the shared files, writes the docs, checks it and opens the first pull request. Use when a new product starts.
---

# Make a new product

A product starts as a copy of `template/` in toolkit at one release, with every `template` renamed to the product's name. The section "Making a product from it" of the template's README holds the background: the packages to check, the slices and how to leave one out, and the hand edits for a product with only an API. `zigordev/playground` and `zigordev/notifications` were made this way, and the first pull request of each shows the result.

## Before anything

1. **The owner's yes.** Creating a repo waits for the owner. Ask once, with the product's name, in lower case letters, digits and dashes, and its halves: an API and a web app, or an API only.
2. **The account.** `gh config get user -h github.com` must print `zigordev`. If it does not, say so, then run `gh auth switch -u zigordev`.
3. **The release.** Take the newest one, `gh release list --repo zigordev/toolkit --limit 1`, and its commit, `git ls-remote https://github.com/zigordev/toolkit refs/tags/vX.Y.Z`.
4. **The packages.** npm must hold a real version of every `@zigordev` package that the copied apps import, not only the empty 0.0.0 of a first publish: `npm view @zigordev/<package> version`. npm lags a few minutes behind a release, so read `https://registry.npmjs.org/@zigordev%2f<package>/<version>` until it answers 200. A package that npm lacks waits for the owner's first publish, so ask for it. Leave its slice out only when the product cannot wait.
5. **A laptop port** for its PostgreSQL that no other product uses. 5433 is the template's. `grep -h ':5432$' */compose.local.yaml`, in the workspace folder, lists the ports of the other products, and `lsof -nP -iTCP:<port> -sTCP:LISTEN` shows one in use.

## The repo

1. **Create it:** `gh repo create zigordev/<name> --public --add-readme --description "<one line>"`. The README gives `main` its first commit, so the first pull request has a base, and nothing is pushed to `main`.
2. **Hand it to the platform.** A repo's settings live as code in `platform/infra/github`. Send the repo's id, `gh api repos/zigordev/<name> --jq .id`, to the session that works in `platform`, or to the owner when none runs. That change adds the settings, the ruleset with `check` required, and the alerts that switch on the dependency graph. Its apply waits for the owner, and until it lands the Dependencies job fails with a 403.
3. **Clone it** into the workspace folder, beside toolkit. Set `git config user.name zigordev` and `git config user.email zigordev@gmail.com` in it, and read both back in a command of their own.
4. **Branch:** `git fetch origin`, `git switch -c feat/<name>-from-template origin/main`, then `git branch --unset-upstream`. The repo has no ruleset and no hooks yet, so a bare `git push` could otherwise reach `main`.

## The copy

1. **Export the template** at the release into the scratchpad, from a toolkit checkout: `git archive vX.Y.Z template | tar -x -C <scratch>`. To leave a slice out, put the files of its pull request back as they were at the release before it, and delete the files it added.
2. **Copy and rename.** Copy it into the repo without the template's README and, for a product with only an API, without `apps/template-web`. Rename in paths and in text, in this order:
   - `template/apps/` to `apps/`;
   - `createTemplateApiClient` and `TemplateApiClient` to the name in PascalCase, such as `createMyShopApiClient` for `my-shop`, and `Template API` to the name's API;
   - the descriptions "The API of the product template" and "the template's API" to the API of the name;
   - `template.localhost`, `template.zigordev.com` and `template.greetings`;
   - then `template-`, `template_` and `TEMPLATE_`.

   Never rename `templateUrl` or `postgresTemplateUrl`, which belong to `@zigordev/test`.

3. **Write the root files:**
   - every `@zigordev` dependency of the apps and packages as `catalog:`, in place of `workspace:*`;
   - `package.json`: toolkit's `packageManager`, `engines` and scripts without `test:stories`; the lint line `biome ci . && markdownlint-cli2 && zizmor --offline . && zigordev check`; the template's `local:up`, `local:down`, `local:reset`, `dev` and `check:contract`, renamed; and as `catalog:` devDependencies Biome, commitlint, `@vitest/coverage-v8`, lefthook, markdownlint-cli2, `@types/node`, `@zigordev/dev`, `@zigordev/stack`, TypeScript and Vitest;
   - `pnpm-workspace.yaml`: the packages `apps/*` and `packages/*`; toolkit's catalog entries for exactly the dependencies in use, in the default catalog and in the named ones such as `shipped` and `openapi-typescript`; every `@zigordev` package at npm's newest version; `catalogMode: strict`; toolkit's overrides; `minimumReleaseAge` with `@zigordev/*` excluded; `trustPolicy`; and `allowBuilds`;
   - `mise.toml`, `biome.json` and `.gitignore` as toolkit has them;
   - a `tsconfig.json` that extends `@zigordev/dev/tsconfig/base.json`, and a `vitest.config.ts` whose projects are the configs of the apps and the packages and the root tests, with coverage of their `src` at the floor of 90%. `notifications` has both.
4. **The port, the build and the pins.** The laptop port takes the place of 5433 in `compose.local.yaml`, in the API's `.env.development` and in its `src/config.test.ts`. The build context in `compose.local.yaml` becomes `.` in place of `..`. In `.github/workflows/ci.yml`, every pin of toolkit takes the release's commit, with the version after it.
5. **Hand edits.** A product with only an API makes the changes that the template's README lists under "A product with only an API". A product with pages renames the page title `Template` in `layout.tsx` and `page.tsx`, and in their tests.
6. **What is left.** `grep -rni template --exclude-dir=.git .` shows it. Only `templateUrl` and `postgresTemplateUrl` stay.

## Install, docs and check

1. **Install:** `mise trust` and `mise install`, then `pnpm install --ignore-scripts`, `pnpm exec zigordev sync` and `pnpm run prepare`. The hooks' file arrives with the sync, so `prepare`, which installs the hooks, runs after it.
2. **Regenerate** what the new titles change: `pnpm --dir apps/<name>-api run openapi`, then `pnpm --dir packages/<name>-api-client run generate`.
3. **The docs** that the `docs` rule asks for: `README.md`, adapted from the template's, `docs/local-first-start.md`, `docs/cloud-first-deploy.md`, `docs/user-manual.md`, and record 0001 with the owner's yes, beside its index in `docs/adr/`. Add a `CLAUDE.md`. A link into toolkit is absolute, because the `links` rule follows relative ones.
4. **Check:** `pnpm format`, `git add -A`, then `pnpm check`. When Testcontainers finds no Docker, set `DOCKER_HOST` on the command: on OrbStack it is `unix://$HOME/.orbstack/run/docker.sock`. Then `pnpm check:contract`. It leaves its image and an untagged image of the build stage, whose history names `<name>-api deploy --prod /out`. Remove those two, and only those.
5. **Try it:** `docker compose --file compose.yaml --file compose.local.yaml up --detach --wait`, beside the shared services that already run. Ask its routes at `http://<name>.localhost`, then run `down --volumes` and remove the images. Do not use `pnpm local:up`, which also starts the shared services.

## The pull request

1. **Open it.** Commit with the message in a file and `git commit -F`. commitlint refuses a body line longer than 100 characters. Push with `git push -u origin <branch>`, and open the pull request as a draft with `--repo` and `--head`. Put the contract's output in it.
2. **Wait for the platform's apply.** It has landed when `gh api repos/zigordev/<name>/rules/branches/main` names `check` and `gh api repos/zigordev/<name>/dependency-graph/sbom` answers. Then edit the description, which runs the pipeline again, because a run started by hand waits for the owner.
3. **Merge on green:** `gh pr ready`, then `gh pr merge --auto --squash`. Never poll the pipeline. Read the pull request once when you come back to it.
4. **After the merge,** `gh api users/zigordev/packages/container/<name>-api --jq .visibility` prints `public`. If it does not, the owner makes the image public before the first deploy. Renovate finds the new repo by itself: within minutes it opens its Dependency Dashboard issue and its first pull requests, among them the `zigordev` group's. If none comes, say so in the report.

The deploy target, its secrets and the Deploy job come later, in a step with the platform session.

## A slice that was left out

When its package reaches npm, the slice comes in a pull request of its own:

1. Make the copy again from the new release into the scratchpad, with the same name and port.
2. `diff -rq <scratch>/apps apps` lists the slice's files and nothing else. Copy them over the repo's, then run `pnpm format`.
3. Take the catalog lines from the scratch `pnpm-workspace.yaml`. A package's peers can lift the other `@zigordev` packages to its version.
4. Read Renovate's pull request for the `zigordev` group first. If it has merged, cut the branch after it. If not, the slice's pull request carries the versions, and Renovate's is no longer needed.
