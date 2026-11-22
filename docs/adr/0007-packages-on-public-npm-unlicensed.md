# 0007. Packages go to the public npm registry, unlicensed

- Status: accepted
- Date: 2026-11-21
- Supersedes: none

## Context

November published the shared packages to GitHub Packages. That registry asks for a token to install, on the laptop, in CI, in Docker builds and in Renovate.

## Decision

The shared packages are published to the public npm registry as `@zigordev/<name>`. Each is marked `UNLICENSED`: anyone can read and download it, and nobody else has the right to use, copy or change it.

Publishing relies on npm's trust in GitHub's sign-in, so no token is stored anywhere. The name `zigordev` was free on npm on 2026-11-21.

## Consequences

- An install needs no token anywhere.
- The owner creates an npm account with two-factor sign-in, and publishes the first version of each new package name once, with a script.
- A published version is hard to take back.
- A tool whose free terms ask for an open-source licence needs a second look. CodeQL is one, and that choice is open since 2026-11-22.

## Alternatives considered

- **GitHub Packages, as before.** Everything stays in GitHub with no first publish by hand. Every install needs a token.
- **The MIT licence.** Anyone could use, copy and change the code, as long as the copyright notice stays.
