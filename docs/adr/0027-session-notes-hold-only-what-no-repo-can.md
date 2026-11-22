# 0027. Session notes hold only what no repo can hold

- Status: accepted
- Date: 2026-11-21
- Supersedes: none

## Context

Claude Code keeps notes between sessions. By the restart there were 120 of them about the old estate, most of them history, and their index loaded into every session. The rules lived in prose as well, in one file of about 200 lines.

## Decision

The old notes are archived with the backup, and a short new set starts. A note holds only what no repo can hold: the quirks of the owner's machine and the owner's preferences. What is known about a project goes into its docs, its decision records and its runbooks. A rule that a machine can check becomes a check.

## Consequences

- A session loads less, and what it loads is current.
- What is known about a project is in its repo, where a person can read it too.
- An old lesson is one lookup further away.

## Alternatives considered

- **Keep the notes and prune them by hand.** Nothing would move, and every session would carry a long list of history.
