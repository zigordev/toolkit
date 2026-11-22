# 0025. Grype scans the images

- Status: accepted
- Date: 2026-11-21
- Supersedes: none

## Context

November scanned its images with Trivy. On 2026-03-19 Trivy's releases and its GitHub Action were replaced with malicious versions.

## Decision

Grype, the open-source scanner from Anchore, scans every image in the pipeline for known flaws in its system packages and its libraries.

## Consequences

- The pipeline has a scanner for each kind of thing: CodeQL for our own code, Dependency Review for new dependencies, secret scanning and gitleaks for secrets, zizmor for workflows, and Grype for images.
- Grype is pinned like every other tool, so a bad release cannot arrive unseen.

## Alternatives considered

- **Trivy, pinned to a verified version.** The scanner we knew, from a project whose releases were compromised.
- **No image scanner.** GitHub's alerts for libraries and fresh base images through Renovate would have to be enough.
