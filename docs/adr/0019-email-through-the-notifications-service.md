# 0019. Email goes through the notifications service

- Status: accepted
- Date: 2026-11-21
- Supersedes: none

## Context

Products send email, starting with the message that verifies a sign-in. The proposal was a shared library: each product would queue its mail in its own database and send it over SMTP itself. The owner chose the service instead, which November had built and tested.

## Decision

One service delivers the email of every product over SMTP: to Mailpit on the laptop, and through Amazon SES in production. A product renders its own message with `@zigordev/email` and sends it with `@zigordev/notifications-client`, which is generated from the service's OpenAPI document.

The client sends a finished email with a key that makes a retry safe, and it retries three times. A product keeps working when the service is down.

## Consequences

- Delivery, retries, limits and the mail credentials live in one place, with one log of every email.
- A fix to delivery deploys once, for every product.
- One more app and one more database run on the host, and every product depends on them for mail. It is the one shared service that remains.
- Where an email must never be lost, the product queues the call in its own database.
- It is the natural home for push messages to a mobile app later.

## Alternatives considered

- **A shared library in each product.** No extra app. No single place would see all mail, and every product would hold mail credentials.
