# 0046. Each app reads its own flags in the app, through OpenFeature

- Status: proposed
- Date: 2026-11-25
- Supersedes: [0021](0021-one-flagd-per-product.md)

## Context

[Record 0021](0021-one-flagd-per-product.md), accepted on 2026-11-21, runs one small flagd per product, a flag server that reads the product's `flags.json` from its repo. Code asks for a flag through OpenFeature, and a flag carries a removal date that a check enforces. [Record 0030](0030-no-console-for-feature-flags-for-now.md) adds that a flag changes through a pull request and takes effect with the deploy of that merge.

Building step 6.4 on 2026-11-25 showed a gap: the host reads only three files of a product, `compose.yaml`, `compose.production.yaml` and `.env.production.example`. A flagd on the host would never see `flags.json` without a change to the deploy in `platform`.

OpenFeature's provider for flagd, `@openfeature/flagd-provider`, can also read a flags file inside the app, with flagd's own rules, in what it calls its offline mode. It is at 0.18.0, released on 2026-10-22, under Apache-2.0. The rule "stable versions only" kept `@fastify/sse` out for being below 1.0. OpenFeature's server SDK is stable, at 1.23.0.

The owner took two decisions on 2026-11-25. On the provider, in their words: "Allow the providers (Recommended)". On where flags are read: "Read in the app (Recommended)".

## Decision

- Each app keeps its flags in its own `flags.json`, beside its code, in flagd's format. Its image carries the file.
- `@zigordev/flags` reads the file in the app, through OpenFeature's server SDK and the flagd provider in its offline mode. No flagd runs, on the laptop or on the host.
- The flagd provider is allowed below 1.0, as an exception to the rule "stable versions only", and only `@zigordev/flags` imports it. So is its browser provider, if a page ever needs flags in the browser.
- Every flag carries `metadata.removeBy`, a date. The `flags` rule of `zigordev check` fails on a flag without one, and on a flag past it.
- A web app reads its flags on the server, in its server components, so the browser needs no flag provider for now.
- The app's health answer has a part named `flags`, which is not required.

## Consequences

- No container, no port and no platform change for flags. The host's memory goes to the products.
- A flag changes through a pull request and takes effect with the deploy, as record 0030 says, and a test reads the real file, with no container.
- A wrong or missing `flags.json` stops the app as it starts, so a broken image never becomes healthy.
- A minor release of the provider may change its interface. Renovate's pull request then fails its tests, and the change stays inside one package.
- Two apps of one product keep two files. A flag that both need is written in both.
- If a console for flags ever comes, as record 0030 leaves open, a flag service returns as a decision of its own.

## Alternatives considered

- **flagd per product, as record 0021 has it.** The deploy in `platform` would carry `flags.json` to the host as a fourth file. A flag service would be in place for a later console, at the cost of a container per product and a change in another lane first.
- **flagd in an image of our own.** Each product would build flagd with its `flags.json` inside. The contract and the deploy treat every image of ours as an app, so both would need a new rule and label.
- **Our own small client** over flagd's HTTP protocol, with only stable libraries. About 150 lines to keep, and a call to flagd for each flag.
- **Waiting for 1.0 of the providers.** No exception, but flags would wait with no date announced.
