# 0010. Every green merge of a product deploys it

- Status: accepted
- Date: 2026-11-21
- Supersedes: none

## Context

Before the restart, a release was a ceremony: a release pull request, version manifests, and a second repo to update before any deploy.

## Decision

A product deploys from `main` with no release step. Every green merge deploys, one deploy at a time and in merge order.

Unfinished work ships switched off, behind a flag that carries a removal date. A database change comes in steps the running version can live with: add first, switch over, remove later. Rolling back is one command that redeploys the previous version, followed by a revert so that `main` stays true.

## Consequences

- A fix reaches users within minutes. The target is under 10 minutes from merge to production.
- A problem points at one small change.
- A gap in the tests goes straight to production. A version that fails its health gate never receives traffic, and one that answers wrongly from outside is rolled back.

## Alternatives considered

- **The owner chooses when a change goes live.** More control, at the price of bigger and riskier releases and a step that waits for a person.
