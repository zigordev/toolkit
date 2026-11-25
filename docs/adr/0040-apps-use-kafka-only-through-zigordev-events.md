# 0040. Apps use Kafka only through `@zigordev/events`, on `@platformatic/kafka`

- Status: proposed
- Date: 2026-11-25
- Supersedes: none

## Context

[Record 0039](0039-apache-kafka-is-the-broker-one-node-on-the-host.md) makes Apache Kafka the broker. Every app has to use it the same way: typed events, a send that is never lost once the app's own change is saved, a consumer that retries, and the same telemetry. toolkit runs Node.js 26, and its supply-chain settings run no install scripts.

On 2026-11-23 the owner chose the Node.js client, in their words: "A", `@platformatic/kafka`. The yes also covers adding it as a new library.

Facts checked on npm and GitHub on 2026-11-25:

- **`@platformatic/kafka`** 2.19.0, released on 2026-11-24, is under Apache-2.0. It is plain TypeScript, with no native code and no install script, and asks for Node.js 22.22 or 24.6 and later. Its CI runs Node.js 22, 24 and 26 against Confluent Platform 7.5.0 to 8.2.0, which is Apache Kafka up to 4.2. It reports through Node's diagnostics channels, and has no OpenTelemetry package. Its own metrics need prom-client.
- **`@confluentinc/kafka-javascript`** 1.11.0, released on 2026-10-07, is under MIT and runs on the C library librdkafka. Its release has prebuilt binaries up to Node.js 24 and none for 26. The request for them has been open since 2026-10-28.
- **`kafkajs`** last released 2.2.4 on 2023-02-27. Its call for maintainers has been open since 2023-08-08, and a report that it cannot join a consumer group on Kafka 4.0 was closed on 2025-10-03 with the finding that it does not support Kafka 4.

## Decision

- `@zigordev/events`, a package in toolkit, is the only code that imports `@platformatic/kafka`. Apps import `@zigordev/events`, so a change of client stays inside that package.
- The package holds:
  - **typed events**: each has a name, a version and a Zod schema, written once and used by the sender and the reader;
  - **the transactional outbox**: an app writes the event into its own PostgreSQL in the same transaction as its change, and a relay sends it to Kafka. The relay polls, and an empty poll starts no trace;
  - **the consumer**: it retries with growing pauses, then moves the message to a dead-letter topic, and skips an event it has already handled, by the event's id;
  - **trace headers**: the trace travels in Kafka headers, and the consumer continues it with OpenTelemetry's messaging attributes;
  - **health and metrics**: `/health` reports Kafka as a component. Messages produced and consumed, retries, dead letters, and the outbox backlog with the age of its oldest row are recorded through `@zigordev/otel` only, labelled per app and topic, never per message;
  - **a test helper** that starts `apache/kafka` with Testcontainers.
- Message bodies, keys and addresses never reach spans, logs or labels. A key is a request id, never an address.
- toolkit's own tests run the package against the Kafka version that the platform runs, 4.4.0 today.
- The package starts private, and its first publish is the owner's.

## Consequences

- Every app sends and receives the same way, with the same failure handling and the same telemetry, and nothing is lost between a commit and its send.
- An event reaches Kafka a moment after its commit, not at once. The relay's poll sets the delay.
- An event can arrive twice, so every reader skips by id.
- The client's makers do not test Kafka 4.4.0, so toolkit's tests are the proof.
- `@platformatic/kafka` and Apache Kafka get their rows in the handbook's tools page in the pull request that brings the package.

## Alternatives considered

- **Confluent's `@confluentinc/kafka-javascript`.** Kafka's best-known C library underneath, and paid support from Confluent. It has no Node.js 26 binary, and toolkit would not compile one at install. It can replace the client inside the package once it has one.
- **`kafkajs`.** The client of the legacy apps, and the only one with an OpenTelemetry instrumentation. Unmaintained since 2023, and it does not support Kafka 4.
- **Each app uses a client directly.** No shared package to keep, but every app would solve the outbox, the retries and the telemetry again.
