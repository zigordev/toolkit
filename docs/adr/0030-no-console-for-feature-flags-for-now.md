# 0030. No console for feature flags for now

- Status: accepted
- Date: 2026-11-22
- Supersedes: none

## Context

A product's flags live in its `flags.json`, and its own flagd serves them, as [record 0021](0021-one-flagd-per-product.md) says. The old estate had a console where a flag could be switched without git.

The owner asked how an enterprise lets people who are not developers manage flags, and set one condition: it has to stay free as the platform grows. The options were read on the vendors' own pages on 2026-11-22.

## Decision

There is no console for now. A flag changes through a pull request to the product's `flags.json`, and takes effect with the deploy of that merge.

The choice comes back when a person who is not a developer has to switch a flag.

## Consequences

- Nothing new runs, and nothing can start to cost money.
- A flag change is reviewed, checked and recorded in git like any other change.
- Only someone who can open a pull request can switch a flag, and a switch takes as long as a deploy.
- The step that builds flags stays as planned.

## Alternatives considered

- **Our own console on top of flagd, after phase 7.** About 7 screens, 15 to 20 endpoints and 6 tables. It would be free for good and shaped to the platform, and a product of its own to build and keep.
- **Flipt.** A ready console with environments and storage in git, free for our own use under its Fair Core License. Opening a pull request from the console is in its paid plan, at $200 a month, and it would take the place of flagd.
- **Unleash, the open-source edition.** One project and two environments, with approvals and single sign-on in the paid edition. It needs a PostgreSQL of its own.
- **A hosted free plan, such as LaunchDarkly or ConfigCat.** Free until a limit is passed: 5 connected services at LaunchDarkly, and 10 flags at ConfigCat. Each then charges by the month.
