# 0004. One repo per product

- Status: accepted
- Date: 2026-11-21
- Supersedes: none

## Context

A product is something users open: cv, gpool, trading-bot. The question was whether each keeps its own repo, or whether the shared parts and every product share one.

## Decision

Each product has its own public repo. It holds the product's API, its web app, its compose files, its flags and its docs. Shared code arrives as released packages from `toolkit`.

## Consequences

- A product is one self-contained stack, which starts, deploys and restores alone.
- Sessions can work on different products at the same time.
- A shared change reaches a product as an update pull request, which Renovate opens and merges by itself.
- Every repo carries the same tooling. The shared files and the conformance check keep the copies equal.

## Alternatives considered

- **One repo for everything.** One pull request per change and no package releases. Only one session could work at a time, and unrelated products would share one history.
