# 0033. A flawed dependency of a dependency is replaced by an override

- Status: accepted
- Date: 2026-11-22
- Supersedes: none

## Context

The Dependencies job fails a pull request that adds a package with a known flaw, whatever its severity. GitHub also reports a flaw in a package that `main` already holds.

Most flaws go with an update, and Renovate proposes it. A dependency of a dependency is different. We do not choose its version: the package that brings it in does.

On 2026-11-22 that stopped the work twice:

| Package       | Flaw                                                                                              | Brought in by                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| katex 0.16.47 | [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7), low, fixed from 0.18.2  | markdownlint, through `micromark-extension-math` 3.1.0. That package asks for katex `^0.16.0` and has had no release since 2024-07-08 |
| glob 10.5.0   | [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4), medium, fixed in 14.0.2 | The all-in-one bundle of OpenTelemetry instrumentations, through a detector for Google's cloud                                        |

katex failed the first pull request of `platform`, and GitHub reported it on `main` here. glob failed [pull request 32](https://github.com/zigordev/toolkit/pull/32).

## Decision

A known flaw in a dependency of a dependency is handled in this order:

1. **Update the package that brings it in**, when a release of that package asks for a fixed version.
2. **Do without the package that brings it in**, when we use little of it. This is the only fix that reaches the users of a package we publish.
3. **Otherwise, replace the flawed package** with a fixed version, at an exact version, under `overrides` in `pnpm-workspace.yaml`.

No advisory goes on an allow-list, and the Dependencies job keeps failing on every severity.

An override line goes again once step 1 is possible. A new major version waits a month under an override too.

## Consequences

- A flaw does not stay because someone else has not released.
- An override installs a version that the package above it was not written for. What we use of that package is tried before the merge, and the pull request says how.
- Nothing removes an override by itself. Whoever updates the package that brings the dependency in looks whether the line can go.
- An override holds in one repo. Every repo that installs markdownlint needs the katex line, and the product template carries it.
- For a package we publish, an override here does nothing for the repos that install it. That is why step 2 comes first: `@zigordev/otel` names the four instrumentations it uses, and the bundle went.

## Alternatives considered

- **Put the advisory on an allow-list.** One line in the Dependencies job, and the flaw stays installed. A list of accepted flaws grows, and nobody reads it again.
- **Fail only on a high severity.** Both cases would have passed, and both flaws would still be installed.
- **Wait for the package that brings it in.** `micromark-extension-math` has not moved in over two years, and a new repo cannot merge its first pull request meanwhile.
- **Replace the tool.** markdownlint checks every doc, and the flaw sits in code it never runs.
