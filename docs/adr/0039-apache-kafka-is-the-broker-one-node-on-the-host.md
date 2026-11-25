# 0039. Apache Kafka is the broker, one node on the host

- Status: accepted
- Date: 2026-11-25
- Supersedes: none

## Context

On 2026-11-23 the owner asked for a central notifications service that takes its requests through Kafka, as the service before November's did, because later projects need a broker anyway. Apps made from the template should be able to use it from the start. The legacy host ran Redpanda, a Kafka-compatible broker, as one node, and five legacy apps talked to it.

The owner took three decisions on 2026-11-23, one at a time:

1. Kafka as the platform's broker, the owner's own wish.
2. Where it runs in production. In their words: "A", one broker in a container on the host.
3. Apache Kafka or Redpanda. In their words: "A", Apache Kafka.

The owner accepted this record on 2026-11-25, in their words: "Accept 0039 (Recommended)".

Facts checked on 2026-11-25:

- Apache Kafka is under Apache-2.0. Its latest release is 4.4.0, released on 2026-10-22, and the project's own image `apache/kafka` has arm64 builds of it. In KRaft mode one process is both broker and controller, with no ZooKeeper. Its start script gives it 1 GB of memory for its heap unless told otherwise.
- Redpanda's versions from v26.3.1, released on 2026-11-20, come under the Redpanda Community Edition License, last updated on 2026-11-05. It allows internal use only, up to 50 cores, forbids changing the software, and lets Redpanda collect usage data. Its GitHub repo was archived on 2026-11-12.
- Amazon MSK, AWS's service that runs Apache Kafka, spreads at least two brokers over different zones. Its smallest broker, kafka.t3.small, costs $0.0499 an hour in eu-west-1, so two cost about $72.85 a month before storage at $0.11 a GB-month (AWS price list, published 2026-11-17).

## Decision

- Apache Kafka is the one broker for messages between services. Apps use it only through `@zigordev/events`, as [record 0040](0040-apps-use-kafka-only-through-zigordev-events.md) says.
- It runs from the official image `apache/kafka`, pinned by its digest as [record 0038](0038-images-of-others-are-pinned-by-their-digest.md) says, as one KRaft node that is broker and controller at once.
- `platform` runs it: in `@zigordev/stack` on the laptop, and in a container on the host in production, with its data on the data disk. It holds the topics, the users of [record 0041](0041-each-app-signs-in-to-kafka-with-its-own-password.md) and their rules as code. A topic is never created by its first use.
- The broker gets a container health check, panels on the Platform dashboard, and alerts with runbooks: the broker is down, messages are stuck, and a message reached a dead-letter topic.
- If the broker ever has to be copied across zones, the step up is Amazon MSK, which runs the same software.

## Consequences

- Every app sends and receives messages the same way, through one broker.
- The broker needs memory, so the host steps up to a t4g.medium when it arrives, as [record 0043](0043-the-host-steps-up-to-a-t4g-medium-when-the-broker-arrives.md) says.
- One node keeps one copy of each topic. The daily snapshot of the data disk covers it, and messages written after the last snapshot are lost with the disk. When the host is down, so is the broker. An app keeps working, and its outbox holds what it sends.
- Testcontainers' Kafka module documents only Confluent's image, so toolkit brings a small helper that starts `apache/kafka` in tests.
- Alloy's built-in Kafka exporter reads the lag of each consumer group, with a Kafka user of its own. The broker's internal metrics, which Java exposes over JMX, are not collected.
- Phase 5 grows. On 2026-11-24 the owner kept Kafka in phase 5, in their words "A: keep in phase 5": the broker in `platform` first, then `@zigordev/events` with its template slice, then the notifications service.

## Alternatives considered

- **Amazon MSK from the start.** The same software, run by AWS across zones. About $72.85 a month for the two smallest brokers, against no extra cost on the host until it steps up.
- **A hosted Kafka, such as Aiven.** Aiven's Free plan allows 250 KiB/s, 5 topics and 3 days of retention, and Aiven may shut down a free service that is unused. Its Developer plan costs $35 a month.
- **Redpanda, as the legacy host ran.** One small binary with no Java. Its new licence allows internal use only and forbids changes, and its repo is archived.
- **No broker, as in November's design.** Each app would call the notifications service over HTTP. The owner wants one broker for this and later projects.
