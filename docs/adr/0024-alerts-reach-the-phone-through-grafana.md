# 0024. Alerts reach the phone through Grafana, with email as the fallback

- Status: accepted
- Date: 2026-11-21
- Supersedes: none

## Context

An alert is useful only when it reaches the owner soon. The alert rules already run in Grafana Cloud.

## Decision

A firing alert goes through Grafana IRM, which pushes it to the owner's phone first and sends an email second.

## Consequences

- One more app sits on the owner's phone.
- Every alert links to a runbook.
- Grafana's product page does not say outright that phone alerts are part of the free plan. Email works either way.

## Alternatives considered

- **Email only.** The simplest setup, at the price of noticing late.
- **A chat app, such as Telegram or Slack.** Fast and familiar, with a bot or a webhook to keep.
