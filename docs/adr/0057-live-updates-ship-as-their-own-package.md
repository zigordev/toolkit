# 0057. Live updates ship as their own package

- Status: accepted
- Date: 2026-11-27
- Supersedes: none

## Context

[Record 0044](0044-live-updates-reach-pages-as-server-sent-events.md) decided how live updates work: Server-Sent Events under `/api/v1`, a PostgreSQL notice in the same transaction as the change, Zod schemas written once for the API and the page, and a React hook that connects again after a break. It did not say where the code lives.

The code has three parts that run in different places: the route and the listener in an API, the hook in a web app's pages, and the schemas in both. An API must not load React, and a page must not load `pg` or Fastify. `@zigordev/auth` already ships parts for Fastify, Next.js and the browser from one package, through separate entries.

On 2026-11-27 the owner was asked where the code should go, with three options: a new package, `@zigordev/api` plus the template, or `@zigordev/api` plus `@zigordev/ui`. They chose, in their words: "A: new live package".

## Decision

- **One package, three entries.** `@zigordev/live` holds the schemas and names in `@zigordev/live`, the route, the listener and `notifyChange` in `@zigordev/live/server`, and the hook in `@zigordev/live/react`.
- **Peers, not dependencies.** Each library it uses is a peer dependency, and every peer an entry does not need is optional, so a web app installs no database driver and an API installs no React.
- **Private first.** The package starts with `"private": true`, as every new package does, until the owner's first publish.
- **The template switches it on.** The template's API adds the route when sign-in is on, and its notes pages refresh on each change. A product made from the template has live updates from its first day, and leaves them out as a slice.

## Consequences

- An app takes live updates by adding one package, and leaves them out by removing it. `@zigordev/api` and `@zigordev/ui` stay as they are.
- The schemas sit in one place, and the API and the page import the same file.
- The package is the 13th that toolkit publishes, with its own version, README and tests.
- `@zigordev/otel` names the route `/api/v1/live` in its list of untraced paths, so that path is fixed for every app.
- A product can take the package from npm only after the owner's first publish, `pnpm exec zigordev first-publish @zigordev/live`, and the pull request that makes it public.

## Alternatives considered

- **`@zigordev/api` plus the template.** No new package, but the API's base would carry a feature that most routes never use, and the hook would have no package: each product would copy it from the template, and copies drift.
- **`@zigordev/api` plus `@zigordev/ui`.** Both parts in packages that exist already, but the design system would hold code with no interface, and the schemas would live in two packages that must move together.
