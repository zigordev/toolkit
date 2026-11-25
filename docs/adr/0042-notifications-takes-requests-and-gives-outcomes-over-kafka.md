# 0042. Notifications takes requests and gives outcomes over Kafka

- Status: accepted
- Date: 2026-11-25
- Supersedes: [0019](0019-email-through-the-notifications-service.md)

## Context

[Record 0019](0019-email-through-the-notifications-service.md), accepted on 2026-11-21, sends every product's email through one notifications service. A product renders its message with `@zigordev/email` and sends it over HTTP with `@zigordev/notifications-client`, generated from the service's OpenAPI document, with a key that makes a retry safe. November's service also answered `GET /api/v1/emails/{id}` with an email's status, which nothing in the legacy code called. The service before November's took its requests from Kafka and sent nothing back.

On 2026-11-23 the owner asked for the service to take its requests through Kafka, which [record 0039](0039-apache-kafka-is-the-broker-one-node-on-the-host.md) makes the broker. On 2026-11-24 they chose how an app learns what happened to its email, in their words: "A: outcome event". The owner accepted this record on 2026-11-25, in their words: "Accept 0042 (Recommended)".

Amazon SES's answer to a send means that SES accepted the email, not that it arrived. Bounces come later, through an SES event feed that nothing in the plan builds yet.

## Decision

- One service still delivers every product's email, to Mailpit on the laptop and through Amazon SES in production. It keeps record 0019's promises: delivery, retries, limits and the mail credentials in one place, with one log of every email.
- A product renders its message with `@zigordev/email` and sends a request event through `@zigordev/events`, on a request topic of its own. The outbox of [record 0040](0040-apps-use-kafka-only-through-zigordev-events.md) saves the request in the product's own transaction, so a request is never lost, and the service skips a request it already has, by its id.
- The service answers each request with an outcome event on the product's own answer topic: sent, or failed after its retries. The outcome names the request, never the address.
- There is no HTTP lookup. One can be added later without changing the events.
- The schemas of the events live in one package, published from the `notifications` repo, in place of `@zigordev/notifications-client`.

## Consequences

- A product keeps working when the service or the broker is down. Its requests wait in its outbox, and then in Kafka.
- A product learns that an email failed and can act on it, for example by showing that a verification email did not go out.
- Sent means that SES accepted the email. Bounces wait for the SES event feed, a later step.
- Push messages to a mobile app can take the same path, and their outcome lets a product drop a dead device token.
- The plan's phase 5 changes: step 5.2's HTTP intake and step 5.3's generated client give way to the package of events, and the broker in `platform` comes first. The platform session updates the Build plan once this record is accepted.
- The trace of one request crosses Kafka in the headers of record 0040, so it still shows end to end.

## Alternatives considered

- **November's HTTP design.** Proven in November, with its generated client, safe-retry key and lookup. A second way for services to talk, beside the broker that later projects need anyway.
- **Requests over Kafka with nothing back, as before November.** The simplest service, but a product would never learn that an email failed.
- **Both an outcome event and an HTTP lookup.** Two ways to learn the same thing, and two interfaces to keep.
