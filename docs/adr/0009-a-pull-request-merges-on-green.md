# 0009. A pull request merges when its check is green

- Status: accepted
- Date: 2026-11-21
- Supersedes: none

## Context

Before the restart the owner approved every merge by hand. On 2026-09-10 a pull request in cv that was marked ready merged, released and deployed within a minute, by surprise.

## Decision

One merge policy holds in every repo. A pull request opens as a draft. Marking it ready means: merge it when the one required check, `check`, is green. Every merge is a squash.

Four kinds of change wait for the owner: an infrastructure change, a migration that deletes data, a tool, library or service the handbook does not list yet, and a new major version of a dependency.

## Consequences

- No ordinary change waits for a person.
- `check` has to run everything, so it runs what `pnpm check` runs on the laptop.
- The title of the pull request becomes the commit on `main`, and its description becomes the body.
- A red `main` is fixed or reverted before any other work.

## Alternatives considered

- **Ask before production.** A change that deploys nothing merges on green, and anything that deploys waits for the owner.
- **Always ask.** Every merge waits for the owner, as before.
