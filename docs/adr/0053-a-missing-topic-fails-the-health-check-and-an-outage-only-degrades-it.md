# 0053. A missing topic fails the health check, and an outage only degrades it

- Status: accepted
- Date: 2026-11-26
- Supersedes: none

## Context

A consumer of `@zigordev/events` that names a topic Kafka does not hold cannot start. It logs `events.consumer_restarting` and tries again, at most every 30 seconds. Until now the events gave an app one health part, `kafka`, which is not required, so `/health` answered `degraded`, with 200.

That has two results. A deploy whose topics are missing passes its health gate and goes live. Once live, the service reads nothing, and the outside check still sees 200. For notifications this means email stops, and nobody is told.

On 2026-11-25 a laptop try found this: one topic missing from the broker stopped notifications reading any of its topics.

The contract check starts each product with no broker at all. Its promise 3 asks `/health` for 200 with `ok` or `degraded`. So making Kafka required would break every product with a consumer.

The Kafka client says a topic is missing in two shapes:

- a protocol error with `apiId` `UNKNOWN_TOPIC_OR_PARTITION`;
- while it reads the metadata, its own error with the code `PLT_KFK_USER` and the message `Unknown topic <name>.`.

On 2026-11-26 the owner was asked what notifications should do when a topic it reads is missing, with three options. They chose, in their words: "A", to fail the health check only when Kafka itself says a topic is missing.

## Decision

- **A second health part.** The events give an app the part `topics`, which is required. It is `down` while Kafka has answered, at a consumer's last start, that one of its topics does not exist. `/health` then answers `error`, with 503.
- **An outage is not a missing topic.** A Kafka that cannot be reached, or that refuses the sign-in, leaves `topics` `up`. Only `kafka` turns `down`, and `/health` answers `degraded`. The contract's promise 3 still holds without a broker.
- **It mends itself.** The part turns `up` again once the consumer starts. `events.topic_missing` is logged at `error` level, once each time a consumer finds a topic missing.
- **Every app registers both parts**, as `events.health` and `events.topics`.

## Consequences

- A deploy with a missing topic rolls back. The host's health check and the deploy's look from outside both see 503.
- Once a service is marked live, Grafana's outside check reports a topic that goes missing later.
- The template registers both parts. notifications registers `topics` when it takes this version.
- The client's second shape is found by its message. A new version of the client that words it differently would hide a missing topic. A test of the client's real answer guards it, as `packages/events/src/events.db.test.ts` runs against a real Kafka.

## Alternatives considered

- **An alert only.** A number of the consumers that run, and an alert after about 10 minutes.
  - It would catch every cause at any time.
  - But a broken setup would still go live, and it needs new work in toolkit and in platform's alerts.
- **Kafka required.** One line, but it breaks the contract's promise 3 for every product with a consumer. It would also fail a deploy whenever the broker is briefly away.
- **Leave it.** Nothing to build, but email would stop with nobody told.
