# 0016. Images are built for arm64, and services run their TypeScript directly

- Status: accepted
- Date: 2026-11-21
- Supersedes: none

## Context

The host is a Graviton machine and the laptop is an Apple one: both are arm64. Node.js 26 runs TypeScript files directly. November built every image for two processor types, and ran the TypeScript of its services directly, which worked.

## Decision

An image is built for arm64 only, published on GHCR as `ghcr.io/zigordev/<app>` and tagged with its commit. A service's image holds its `.ts` files, and Node.js runs them. Type checking happens in the check, before anything is built. Only the packages that are published get compiled.

## Consequences

- One build per image keeps the pipeline short, on GitHub's free arm64 runners.
- A machine that is not arm64 cannot run the images.
- What runs is the source: a service has no build step and no build output to drift.
- The code may use only syntax that Node.js can strip, so there are no enums and no parameter properties.

## Alternatives considered

- **arm64 and amd64, as in November.** Only a machine that is not arm64 would need the second build.
- **Compile services to JavaScript first.** A build step in every service, for no gain on Node.js 26.
