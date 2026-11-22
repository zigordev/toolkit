# 0012. Renovate merges patch and minor updates in working hours

- Status: accepted
- Date: 2026-11-21
- Supersedes: none

## Context

Every green merge deploys, so an update that merges by itself also deploys by itself. In November the newest major versions cost time: TypeScript 7 broke tools that needed its old API, and ESLint 10 broke the Next.js preset.

## Decision

Renovate opens every update pull request. It merges patch and minor updates by itself, and new versions of our own packages, once a release is at least one day old and `check` is green. It merges only on weekdays between 08:00 and 18:00.

A new major version waits for a person. It arrives as its own task, at least a month after its release.

## Consequences

- Products stay current with no work.
- Nothing deploys unattended at night or on a weekend. An update that arrives outside the window waits for the next one.
- A bad minor update can still reach production. The check, the health gate and the rollback stand in its way.

## Alternatives considered

- **Patch updates only.** Minor versions would wait for a person too.
- **Nothing merges by itself.** Every update would wait for a person.
- **A wider window.** Every day between 08:00 and 22:00, or any time.
