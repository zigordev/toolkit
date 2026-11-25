# 0049. Shared rules and skills are links to the installed package

- Status: accepted
- Date: 2026-11-25
- Supersedes: none

## Context

Every repo held a copy of each of the 23 files in the `shared` folder of `@zigordev/dev`, written by `zigordev sync`, and the `shared` rule of `zigordev check` failed when a copy differed from the installed package. A release that changed one of those files therefore turned every repo's Renovate update red, because Renovate updates the package but cannot run `zigordev sync`. On 2026-11-25 that happened in playground#9 and platform#56, after the core rules changed, and v1.27.0 added the new-product skill, a new file for every repo.

Facts read on the vendors' own pages on 2026-11-25:

- The free Mend-hosted Renovate app runs only an unpublished set of approved commands after an update, and free users cannot ask for more.
- Renovate stops updating and merging its pull request once anyone else commits to the branch, unless that author is in `gitIgnoredAuthors`.
- When a workflow updates a pull request with its own `GITHUB_TOKEN`, the pipeline runs wait for approval by someone with write access.
- Claude Code reads `.claude/rules/` recursively, follows symbolic links there, and accepts a skill folder that is a symbolic link.

A trial on 2026-11-25 with Claude Code 2.1.330 used a throwaway repo with pnpm's layout and `node_modules` ignored by git. A linked rule loaded at start, a linked path-scoped rule loaded when a matching file was read, and a linked skill ran. With the package folder gone, the session started without errors, and without them.

## Decision

- `.claude/rules` and `.claude/skills` are symbolic links, committed in git, to the same folders of the installed `@zigordev/dev`: `../node_modules/@zigordev/dev/shared/.claude/rules` and `../node_modules/@zigordev/dev/shared/.claude/skills` in a product repo, and the source folders in `packages/dev/shared` in toolkit.
- Every other shared file stays a copy: `.claude/settings.json` and `.claude/hooks/`, so that the permission rules and the guard work before any install, and the files that GitHub and the tools read from git.
- `zigordev sync` writes the links and the copies. The `shared` rule fails when a link is missing, is a folder of copies or points elsewhere, and when a copy differs.

## Consequences

- A release that changes or adds a rule or a skill reaches a repo through Renovate's update alone, with no change in the repo, so the update stays green and merges by itself.
- A repo's rules and skills always match the `@zigordev/dev` that its lockfile installs.
- Rules and skills exist only after `pnpm install`. A session in a fresh clone has the settings, the guard and the global and workspace instructions, but not the repo's rules and skills until it installs. `start-work` installs early.
- A change to the settings, the hooks or another copied file still turns each repo's update red once, until someone runs `zigordev sync` on that branch.
- A repo cannot keep a rule or a skill of its own inside the linked folders. None does on 2026-11-25. A repo's own instructions go in its `CLAUDE.md`.
- Each repo needs one last `zigordev sync`, to replace its copies with the links.

## Alternatives considered

- A bot that commits the sync on Renovate's pull request, pushing as a GitHub App. Free, but the owner creates the App and sets its private key in every repo, since a personal account has no shared secrets, and every update gets a second commit and a second pipeline run.
- Running Renovate ourselves, with the sync as an allowed post-upgrade task. One clean commit per update, but a service to run and upgrade, an App or a token and its secret, and Mend's app removed. Allowing the command in Mend's hosted app needs its Enterprise plan, whose price Mend does not publish.
- Letting the update pass with old copies and syncing later. A few lines, but `main` keeps old rules and skills, and the failure moves to the next pull request.

The owner chose the links on 2026-11-25, in their words: "Link rules and skills".
