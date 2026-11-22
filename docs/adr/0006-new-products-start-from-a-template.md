# 0006. New products start from a template in toolkit

- Status: accepted
- Date: 2026-11-21
- Supersedes: none

## Context

The shared packages need a proof that they work together, and a new product needs a place to start. November had small fixtures that existed only for the tests, and a product was assembled by following the handbook.

## Decision

`toolkit` holds a product template in `template/`: a minimal product, one API and one web app, wired with every shared package. It carries one example feature, notes that a signed-in user can create, edit and delete, because that one feature touches every package.

CI builds and tests the template on every change. Every new product starts as a copy of it. The template is never deployed.

## Consequences

- The pull request that changes a package also proves it, because the template runs on the packages of the same checkout.
- The template grows in six slices: hello, data, sign-in, flags, interface and journeys. A capability is done when its slice passes in CI.
- The template has to stay minimal, or it becomes a product of its own.
- What production proves comes from real things: the notifications service proves the service half, and cv proves the web half.

## Alternatives considered

- **Small test fixtures only.** As in November. A new product would be assembled by hand from the handbook.
- **Packages tested alone.** Whether they work together would be checked by hand.
