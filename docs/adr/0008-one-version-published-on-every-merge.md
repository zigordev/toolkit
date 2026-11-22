# 0008. One version for all packages, published on every merge

- Status: accepted
- Date: 2026-11-21
- Supersedes: none

## Context

November gave each package its own version through release-please. Between a merge and its publish sat a release pull request, whose checks GitHub held back.

## Decision

All packages share one version. A merge to `toolkit` that changes a package publishes all of them within minutes. semantic-release reads the title of the merged commit, picks the next version, publishes to npm and writes the release notes. Renovate carries the new version to each product.

## Consequences

- "This product is on toolkit 1.4.0" says everything about its shared code.
- A product gets one update pull request, not one per package.
- Packages that use each other always match.
- A package that did not change gets a new version too, and one breaking change raises the major version of all of them.
- Nothing can be held back once it is merged. The type in the pull request title decides patch, minor or major, so the title matters.

## Alternatives considered

- **A version per package, with a release pull request.** Precise versions and a moment to review, at the price of a release step between every merge and its publish.
- **A small script of our own in place of semantic-release.** About fifty lines that would be ours to keep working.
