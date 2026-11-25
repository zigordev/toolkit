# 0043. The host steps up to a t4g.medium when the broker arrives

- Status: accepted
- Date: 2026-11-25
- Supersedes: [0015](0015-one-small-host-on-ubuntu.md)

## Context

[Record 0015](0015-one-small-host-on-ubuntu.md), accepted on 2026-11-21, runs production on one t4g.small with 2 GiB of memory, on Ubuntu LTS. It steps up to a t4g.medium with 4 GiB when gpool joins, and to a t4g.large with 8 GiB when trading-bot brings its analytics store. It estimated the shared services and the notifications service at about 1 GiB, and each product at about 0.5 GiB more.

[Record 0039](0039-apache-kafka-is-the-broker-one-node-on-the-host.md) puts a Kafka broker on the host. Kafka runs on Java, and its start script gives it 1 GB of memory for its heap unless told otherwise. On 2026-11-23 the owner chose, in their words: "A", one broker on the host, and the host steps up to a t4g.medium when the broker arrives. The owner accepted this record on 2026-11-25, in their words: "Accept 0043 (Recommended)".

Facts checked on 2026-11-25:

- In eu-west-1, a t4g.small costs $0.0184 an hour, $13.43 a month of 730 hours, and a t4g.medium costs $0.0368 an hour, $26.86 a month (AWS price list, published 2026-11-24).
- AWS's T4g free trial covers 750 hours a month of t4g.small until 2026-12-31. In AWS's words: "Only the t4g.small infrastructure cost is included and covered under the free trial." From 2027-01-01 a t4g.small costs its normal price.

## Decision

- Production stays one Graviton host on Ubuntu LTS, run as record 0015 describes, and it starts as a t4g.small.
- It steps up to a t4g.medium with 4 GiB when the Kafka broker arrives, in phase 5. gpool no longer moves the host on its own: it joins the medium.
- The next step stays as record 0015 has it: a t4g.large with 8 GiB when trading-bot brings its analytics store.
- Each step is a change to the host's code in `platform`, and waits for the owner's approval like every change to the infrastructure.

## Consequences

- From the broker's arrival, the host costs $26.86 a month instead of $13.43: $13.43 more at list price.
- A step before 2027-01-01 also ends the free trial's saving, because the trial covers only the t4g.small.
- The broker's memory and each container's share are an estimate until the broker first runs. The host's memory report, from step 3.4, shows what each container uses against its limit.
- Changing the size stops and starts the host, a short outage that is planned like any change to the infrastructure.

## Alternatives considered

- **The broker off the host.** Amazon MSK, at about $72.85 a month for its two smallest brokers, or a hosted Kafka, as record 0039 weighs. The host could stay a t4g.small for longer.
- **The broker on the t4g.small, with a smaller heap.** No extra cost, but the broker, the shared services and the playground would leave little room for the first product.
