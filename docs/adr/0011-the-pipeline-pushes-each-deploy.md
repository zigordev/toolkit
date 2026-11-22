# 0011. The pipeline pushes each deploy through AWS Systems Manager

- Status: accepted
- Date: 2026-11-21
- Supersedes: none

## Context

November chose doco-cd: an agent on the host that applies what a git repo says. It never ran in production before the restart.

## Decision

The pipeline delivers. GitHub Actions tells the host which commit to run, through AWS Systems Manager, and then checks the result. On the host, docker-rollout starts the new version beside the old one and lets it take over once it is healthy.

Before a deploy, the pipeline checks that GitHub built the image from our own repo. Each product repo gets one narrow role in AWS.

## Consequences

- Build, deploy and health check are one run. A failed deploy fails the run and tells the owner.
- The host needs nothing new but Docker and the AWS agent.
- A service may have no fixed container name and no published port, because two versions run side by side for a moment.
- When GitHub Actions is down, nothing deploys.
- The wanted state is not a file in git. A rebuilt host redeploys every app at its recorded version.

## Alternatives considered

- **The host pulls from git, with doco-cd.** A product repo would need no access to AWS. The agent is one we have never run, and a failure would show on the host, not in the run.
