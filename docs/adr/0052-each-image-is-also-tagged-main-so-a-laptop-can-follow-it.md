# 0052. Each image is also tagged main, so a laptop can follow it

- Status: accepted
- Date: 2026-11-26
- Supersedes: none

## Context

Until now `publish.yml` pushed each image of a product under its commit only, as `ghcr.io/zigordev/<app>:<commit>`. A deploy names that commit and checks the image's digest, as [record 0038](0038-images-of-others-are-pinned-by-their-digest.md) and the handbook's delivery page describe.

On 2026-11-26 the shared services of `platform` began to run notifications on every laptop, in platform#83, so that `pnpm local:up` in any repo delivers an app's email to Mailpit. That copy is pinned as `notifications-api:<commit>@sha256:<digest>`.

Renovate keeps every other image in a compose file current. It reads the image's tags, finds the newest, and proposes its digest. A commit cannot be put in order, so Renovate cannot tell which commit tag is newer, and nothing would move the laptop's pin.

On 2026-11-26 the owner was asked how the laptop's copy stays current, with three options. They chose, in their words: "A: a moving tag".

## Decision

- **A second tag.** `publish.yml` pushes each image under its commit and also as `ghcr.io/zigordev/<app>:main`. The workflow runs on `main` only, so `main` always names the newest image built from `main`.
- **Nothing deploys by `main`.** A deploy keeps naming the commit and checking the digest.
- **A laptop follows `main` with its digest.** A compose file that runs another repo's image on a laptop writes it as `<image>:main@sha256:<digest>`. Renovate proposes the new digest each time `main` moves, after the day's wait, and merges it once `check` is green.

## Consequences

- A change to notifications reaches laptops by itself, in two steps:
  - Renovate moves the pin in `platform` and releases `@zigordev/stack`;
  - each product takes that release through its own Renovate pull request.
- Every product's images carry the tag, also those that no laptop follows. A tag adds no storage.
- A repo starts pushing `main` once it calls the toolkit version that holds this change.
- `main` can name an image whose deploy failed and was rolled back. A laptop may then run a version that production does not. Renovate's day of waiting gives time to notice.

## Alternatives considered

- **Move the pin by hand.**
  - Nothing to build.
  - But it is easy to forget, and laptops would quietly run an old notifications.
- **Version tags from each release**, such as `v1.4.0`.
  - Renovate could order them, and laptops would follow releases only.
  - But a repo releases a version only for a feature or a fix, so dependency updates would never reach laptops.
  - The image is also built before the release knows its version, so the workflow's order would have to change.
- **A tag named `latest`.**
  - It is the usual default name.
  - But it does not say where the image comes from, and tools pull it without being asked.
