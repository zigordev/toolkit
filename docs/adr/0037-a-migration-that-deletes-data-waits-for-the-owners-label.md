# 0037. A migration that deletes data waits for the owner's label

- Status: accepted
- Date: 2026-11-23
- Supersedes: none

## Context

The core rules say that a migration that deletes data waits for the owner, and their table promised that from phase 4 a CI check fails until the owner labels the pull request. On 2026-11-23, with the template's first migrations merged, no such check existed: nothing read a pull request's labels, and nothing read a new migration. Only the data rules, the handbook and the skill `add-migration` stopped one.

On 2026-11-23 the owner was asked "Which check should stop a migration that deletes data?", with three options, and chose, in their words: "Our own rule".

## Decision

A rule of `zigordev check`, named `migrations`, holds every new migration:

- It reads each SQL file in a folder named `drizzle/` that is new: in a pull request, one that the pull request adds; on the laptop, one that `origin/main` lacks.
- It finds what deletes data: `DROP TABLE`, `DROP COLUMN`, `DROP SCHEMA`, `DROP DATABASE`, `TRUNCATE`, `DELETE`, and a change of a column's type. `DROP INDEX`, `DROP CONSTRAINT`, `DROP DEFAULT` and `DROP NOT NULL` lose no data, and pass.
- In a pull request it fails until the pull request has the label `destructive-migration`. Only the owner adds it. A session never does, and the guard hook asks before a label changes.
- The pipeline runs again when a label is added or removed, so every caller listens to `labeled` and `unlabeled`.
- On the laptop no label can be seen, so the rule prints a warning and lets the commit through, and the pull request can still be opened after the owner's yes.

## Consequences

- A migration that deletes data cannot merge by itself, in any repo that takes this version of `@zigordev/dev` and listens to label changes.
- A label added or removed runs the whole pipeline again.
- The rule reads statements, not intent. Data moved into a new column first, then dropped, still needs the label for the drop.
- It does not read inside a body in dollar quotes, such as `DO $$ ... $$` or a function. drizzle-kit writes no such body that deletes data, so a hand-written one is a matter for review.
- In a pull request it needs the merge commit with both of its parents and the whole history. A checkout without them fails the rule, rather than letting it pass in silence.
- `platform` creates the label in every repo, as code, in step 3.3 of the build plan.

## Alternatives considered

- **Squawk 2.74.0**, a linter of PostgreSQL migrations under the Apache-2.0 or MIT licence, with the same label. It knows more cases, but it is a new tool, and its own exceptions are written as SQL comments, which our rules forbid.
- **Not now.** Change the table of the core rules instead, and keep the skill and the data rules as the only stop. Nothing would fail a pull request that deletes data.
