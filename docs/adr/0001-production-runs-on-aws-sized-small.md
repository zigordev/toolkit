# 0001. Production runs on AWS, sized small

- Status: accepted
- Date: 2026-11-21
- Supersedes: none

## Context

The estate that came before ran on one AWS host and cost $36.31 in its last 30 days. All of it was removed on 2026-11-20 and 2026-11-21, so the restart could choose again where production runs and what it may cost.

A similar server at Hetzner costs roughly a third as much. AWS brings managed parts that the platform uses, and practice with AWS is something the owner wants to keep.

## Decision

Production runs on AWS, in the smallest setup that works. There is no fixed monthly ceiling. Every step up in size has a trigger and a price, and the owner sees both before it happens. The start is about $21 a month.

## Consequences

- The infrastructure code is written for AWS: Systems Manager, Parameter Store, SES, S3 and KMS.
- A budget alarm is part of the code. It emails the owner when the forecast for the month passes $30, and it moves with each step up.
- The bill is higher than at the cheapest provider. Free plans cover everything else: Cloudflare, Grafana Cloud, GitHub and npm.

## Alternatives considered

- **The cheapest provider that works.** About a third of the cost at Hetzner. It gives up the managed parts and the AWS practice.
- **Compare both in the plan first.** The owner chose AWS without the comparison.
- **A fixed ceiling of about $20, $40 or $60 a month.** The owner chose no ceiling, with the price of each step shown first.
