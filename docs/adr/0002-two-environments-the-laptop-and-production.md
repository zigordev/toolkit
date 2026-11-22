# 0002. Two environments: the laptop and production

- Status: accepted
- Date: 2026-11-21
- Supersedes: none

## Context

One small host runs everything, and one person owns it. A second copy of every app would cost memory and upkeep. Without one, the laptop has to be a rehearsal that can be trusted.

## Decision

There are two environments, the laptop and production, with no staging between them. The laptop runs the same images, the same compose file and the same telemetry agent as production.

Six things differ, and each is a setting, never different code: the address, the telemetry store, the mail delivery, the source of secrets, the place backups go, and the data.

## Consequences

- Unfinished work ships switched off, behind a flag.
- A database change comes in steps the running version can live with.
- The browser tests run against production-shaped containers, on the laptop and in CI.
- A fault that only production shows reaches users. The health gate and the automatic rollback are the safety net.

## Alternatives considered

- **Staging and production.** Safer rehearsals, at the cost of more memory and more upkeep on the same small host.
- **A preview per pull request.** The closest to big-team practice, with the most moving parts. It waits for a second contributor.
