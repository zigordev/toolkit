# 0051. The broker is watched by a probe and by the apps' own numbers

- Status: accepted
- Date: 2026-11-25
- Supersedes: the exporter lines of [0039](0039-apache-kafka-is-the-broker-one-node-on-the-host.md) and [0041](0041-each-app-signs-in-to-kafka-with-its-own-password.md)

## Context

[Record 0039](0039-apache-kafka-is-the-broker-one-node-on-the-host.md) watches the broker through Alloy's built-in Kafka exporter, which reads the lag of each consumer group with a Kafka user of its own. [Record 0041](0041-each-app-signs-in-to-kafka-with-its-own-password.md) gives that exporter its sign-in and its password.

On 2026-11-25 the platform session proved on the laptop that Alloy 1.22's `prometheus.exporter.kafka` connects to Kafka when Alloy loads its config. When Alloy starts while Kafka is down, not yet ready, or before its Kafka user exists, Alloy refuses its whole config ("could not perform the initial load") and restarts in a loop. Every log, trace and metric of every app then stops until Kafka answers. On the host that happens after a reboot where Alloy starts first, and during any outage of Kafka.

Every app that uses Kafka already reports through `@zigordev/events`, as [record 0040](0040-apps-use-kafka-only-through-zigordev-events.md) asks: `zigordev.events.consumer.lag` per topic and consumer group, `zigordev.events.dead_letters`, and the outbox's backlog and the age of its oldest event.

## Decision

- "The broker is down" comes from Alloy's built-in blackbox exporter, a TCP check of `kafka:9092`. It needs no sign-in, and it never blocks Alloy's start.
- "Messages are stuck" and "a message reached a dead-letter topic" come from the numbers each app reports through `@zigordev/events`: its consumer lag and its dead letters. Those alerts name the app.
- Alloy gets no Kafka user and no secret. Record 0041's line that Alloy's Kafka exporter signs in as a user of its own no longer holds, and neither does Alloy's password.
- The rest of records 0039 and 0041 stands: the three alerts with their runbooks, the broker's health check and panels, a user and a password per app, and the job that applies the rules and the topics.

## Consequences

- A Kafka outage or a slow start of the broker no longer stops the telemetry of every app. The probe reports the outage while everything else keeps flowing.
- One secret and one Kafka user fewer to create, store and rotate.
- A stuck consumer is reported by the app that is stuck, so its alert names the app and leads to its runbook.
- Lost: a view of topics and lag from the broker's side. It would matter only for an app that skips `@zigordev/events`, which record 0040 forbids.
- An app whose consumer stops reporting at all shows no lag. Its own health check and the probe still say whether the app and the broker run.

## Alternatives considered

- **A second Alloy only for the Kafka exporter.** It keeps the broker's view of lag, but adds one more container and its secret, and a start-order problem in the deploy.
- **The exporter inside the main Alloy, as records 0039 and 0041 said.** One container, but it takes all telemetry down with Kafka.

The owner decided on 2026-11-25, in their words: "B, probe + app numbers".
