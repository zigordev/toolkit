# 0015. One small host on Ubuntu LTS, stepping up on memory

- Status: accepted
- Date: 2026-11-21
- Supersedes: none

## Context

The shared services and the notifications service should need about 1 GiB of memory, and each product about 0.5 GiB more. That is an estimate, and the first deploy measures it.

## Decision

Production is one Graviton host, a t4g.small with 2 vCPU and 2 GiB, on Ubuntu LTS, running every stack with Docker Compose. It has no inbound port, a separate data disk, access through AWS Systems Manager and automatic security updates.

It steps up on memory: to a t4g.medium with 4 GiB when gpool joins, and to a t4g.large with 8 GiB when trading-bot brings its analytics store.

## Consequences

- The start costs about $21 a month: $13.43 for the host, $2.64 for 30 GB of disk, $3.65 for the public address, $1.00 for the key that encrypts the infrastructure state, and under $1 each for backups and email. These are list prices for eu-west-1 on 2026-11-21.
- The steps cost about $35 and about $62 a month in total.
- One host is a single point of failure. Backups, and a rebuild from code within 1 hour, answer that.

## Alternatives considered

- **A t4g.medium from the start.** About $35 a month, with room for gpool without a resize.
- **Amazon Linux 2023.** The Linux that AWS tunes for its own hosts. Ubuntu has the AWS agent built in too, and current Docker packages.
- **A system that cannot be changed in place, such as Flatcar or Bottlerocket.** It replaces itself on update. The AWS agent is not built in, and Ubuntu is boring and works.
