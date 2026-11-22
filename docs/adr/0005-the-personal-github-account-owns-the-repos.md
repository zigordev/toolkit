# 0005. The personal GitHub account owns the repos

- Status: accepted
- Date: 2026-11-21
- Supersedes: none

## Context

The repos have always lived under the personal account `zigordev`, on GitHub Free. A free organization would add a merge queue and settings shared across repos.

## Decision

The personal account `zigordev` owns every repo, and every repo is public.

## Consequences

- Public repos keep everything free: the rulesets, the pipeline minutes, the code scan, Dependency Review and secret scanning.
- Logs and artifacts are public too, so nothing secret may ever be printed in a workflow.
- There is no merge queue. A branch need not be up to date to merge, because the run on `main` gates every deploy.
- There are no settings shared across repos. Each repo gets the same ruleset, and from phase 3 the settings are code in `platform`.

## Alternatives considered

- **A free organization.** It adds a merge queue and shared settings, at the price of a new name everywhere.
