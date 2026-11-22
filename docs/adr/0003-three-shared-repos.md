# 0003. Three shared repos: toolkit, platform and notifications

- Status: accepted
- Date: 2026-11-21
- Supersedes: none

## Context

The rebuild of November 2026 had four shared repos. One fix in a shared package took a pull request, a release pull request, a publish and an update pull request in every repo that used it.

The owner asked how an enterprise would organize the shared parts.

## Decision

Three shared repos, then one repo per product:

- `toolkit` holds the shared packages, the design system with Storybook, the product template, the shared pipelines, the handbook and the session rules.
- `platform` holds the infrastructure, the shared services, the host setup, the dashboards and alerts, the backups and the runbooks. It alone can change infrastructure.
- `notifications` holds the email service and its client, and is deployed like a product.

A repo boundary sits where something is owned or deployed separately, and nowhere else.

## Consequences

- A change to a package is proven in the same pull request, by the product template in the same checkout.
- Only `platform` holds rights in AWS. A product repo can do one thing there: ask the host to run a version of itself.
- A new metric lands in `toolkit`, and its dashboard and its alert land in `platform`: two pull requests.
- Three repos have to stay identical in their tooling. The shared pipeline, the shared files and the conformance check do that.

## Alternatives considered

- **Two repos: one for everything shared, and notifications.** A metric, its dashboard and its alert would be one pull request. Infrastructure would sit in the repo that every product depends on, guarded only by approvals.
- **One repo for everything shared.** It saves a repo, and makes the repo every product depends on deploy a production service.
- **Four repos, with the design system apart.** It fits when a separate team owns the design system. It brings back the hops that cost the most time in November.
