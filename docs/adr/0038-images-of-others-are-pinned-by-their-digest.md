# 0038. Images of others are pinned by their digest

- Status: accepted
- Date: 2026-11-24
- Supersedes: none

## Context

A compose file runs two kinds of image. Our own images, `ghcr.io/zigordev/<app>`, are built by toolkit's publish workflow and carry a build record, which the deploy verifies before the host pulls them by their digest. Every other image comes from someone else: PostgreSQL in each product, and Traefik, Alloy, the Docker proxy and `cloudflared` among the shared services.

Those other images were named by tag, such as `postgres:18.7-alpine3.24`. A tag can be moved to another image at any time, by its publisher or by anyone who takes over the publisher's account. The image that the pipeline started on a pull request and the image that the host pulls later can then differ, and nothing would show it. A digest, such as `sha256:0115267a…`, is the content hash of one image and cannot be moved.

On 2026-11-24 the owner was asked how the shared services' outside images should be trusted, and chose, in their words: "Pinned by digest (Recommended)". The owner accepted this record, which extends the choice to every product's compose files, the same day: "ACCEPt".

## Decision

- Every image in a compose file that is not ours is written `name:tag@sha256:<digest>`. The tag stays for people to read, and the digest decides what runs.
- This holds in every compose file: the shared services in `platform` and every product made from the template.
- Renovate pins a missing digest and proposes each new one, after its wait of one day, through the rule in `renovate/default.json`. A new digest merges by itself once `check` is green, like a patch.
- `zigordev contract` refuses a product whose compose files run another image without its digest, and the host refuses to deploy one.
- The build record covers our own images only. An image of others is trusted as its publisher built it, and pinned so that it cannot change without a pull request.

## Consequences

- The host, the laptop and the pipeline run exactly the same image of PostgreSQL or Traefik, and a change to it is a pull request with a check.
- A publisher that rebuilds a tag, such as the official images do when Alpine Linux gets a fix, produces a Renovate pull request. On a quiet week that is a handful of pull requests across the repos, each merging by itself.
- Writing a new compose file by hand takes one more step: the digest, which `docker buildx imagetools inspect <image>` prints.
- The template's API tests read the PostgreSQL image from `compose.yaml`, so that the tests and the product run one image and a new digest changes one line.

## Alternatives considered

- **Tags only.** Nothing to maintain, and every Renovate pull request is a real new version. A moved tag would reach the host unseen, which the owner's choice rules out.
- **Verify the publishers' own signatures.** Docker's official images and Traefik sign some of their images, but not all of ours, and each publisher signs in its own way. It would be a second kind of check beside our build records, for images whose digest pin already stops any change. It can follow later, image by image.
- **Copy each outside image into GHCR under our name, with our own build record.** Every image would then be ours to verify, but every new version would need a copy job and storage, and the host would run copies that nobody else scans.
