# 0034. The pipeline and the host run one named Ubuntu LTS

- Status: accepted
- Date: 2026-11-23
- Supersedes: none

## Context

Every job of the pipeline runs on a machine of GitHub, picked by a label. Until 2026-11-23, eight of the nine jobs of `toolkit` named `ubuntu-latest`. The Contract job named `ubuntu-24.04-arm`, because an app's image is built for arm64.

GitHub moves `ubuntu-latest` by itself. On 2026-11-23 every job on that label ran on the image `ubuntu-26.04`, in `toolkit` and in `platform`, while GitHub's own list of runner images still gave the label as Ubuntu 24.04. No pull request showed the move. A job could have broken with nothing in the repo to point at.

Renovate proposed the next version for the one named label, in toolkit#47, and the Contract job passed on `ubuntu-26.04-arm` there.

[Record 0015](0015-one-small-host-on-ubuntu.md) puts production on one host on Ubuntu LTS, and names no version. The host is built in phase 3.

Canonical gives Ubuntu 26.04 LTS standard security updates until May 2031, and 24.04 until May 2029. GitHub's standard machines cost nothing in a public repo, on either version, for x86 and for arm64.

## Decision

Every job of the pipeline names its machine exactly: `ubuntu-26.04`, or `ubuntu-26.04-arm` for a job that needs arm64. No job names a label that GitHub moves by itself, such as `ubuntu-latest`. The host of phase 3 starts on the same version.

`packages/dev/src/pipeline.test.ts` holds every job of `toolkit`'s three workflows to its label.

The owner took this decision on 2026-11-23, with the words "Yes, move it".

## Consequences

- The pipeline changes its Ubuntu only through a pull request. Renovate proposes the next one, and as a major version it waits a month and for a person. The test of the pipeline fails on that pull request until the person changes the version it names.
- A build, its tests and the host that runs the result share one version of the system.
- A repo that calls the pipeline receives the new labels with the next version of `toolkit`. The jobs of its own, such as the gate in its caller, name their machine themselves.
- The next LTS is one pull request in `toolkit`, one in each repo for its own jobs, and the host's image in `platform`.

## Alternatives considered

- **Keep `ubuntu-latest`.** No work now, and the machines stay current. But GitHub moves them on a day it picks, with no pull request, as it did before 2026-11-23.
- **Wait for phase 3, and move together with the host.** One move instead of two. Until then the pipeline keeps running on a label that moves by itself, and the Contract job stays a version behind the other jobs.
