# 0021. One flagd per product

- Status: accepted
- Date: 2026-11-21
- Supersedes: none

## Context

A feature flag lets unfinished work ship switched off. November ran one shared flagd in the platform, which served the flags of every product.

## Decision

Code asks for a flag through OpenFeature. Each product runs its own small flagd, which reads that product's `flags.json` from its repo. A flag carries a removal date, and a check fails once that date has passed.

## Consequences

- A product stays self-contained: its flags start, deploy and roll back with it.
- A flag changes through a pull request to the product's repo.
- There is no console, so a person who is not a developer cannot switch a flag. Whether to add one is an open choice since 2026-11-22, due before the step that builds flags.

## Alternatives considered

- **One shared flagd.** As in November. One more shared service that every product would lean on.
