# 0036. The client generator runs on its own TypeScript 5

- Status: accepted
- Date: 2026-11-23
- Supersedes: none

## Context

Every API commits its OpenAPI file, and its callers use a client generated from it. The handbook names the tools: openapi-typescript writes the types, and openapi-fetch sends the requests.

On 2026-11-23, openapi-typescript 7.13.0, its newest release (2026-02-11), asked for TypeScript `^5.x`. Under TypeScript 7.0.2, which the whole repo runs, it crashed at once: "Cannot read properties of undefined (reading 'createKeywordTypeNode')". TypeScript 7 no longer offers the compiler API that openapi-typescript builds its output with. November's notifications service hit the same crash.

The owner chose on 2026-11-23, in their words: "Generator package".

## Decision

One version per dependency has one exception, held to one package:

- A named catalog of `pnpm-workspace.yaml`, `openapi-typescript`, holds `typescript: 5.9.3`. Only the private package that generates the clients, `template-client-generator`, takes TypeScript from it. Everything else, the client it writes included, stays on TypeScript 7.
- The generator runs openapi-typescript through its Node.js API and writes the types without comments, into the client's `src/generated/`, which Biome leaves as it is.
- Renovate keeps the catalog's TypeScript below 6.
- The exception goes once a release of openapi-typescript accepts TypeScript 7. A test of the client reads the range of TypeScript that the installed openapi-typescript asks for, and fails when that range admits 7. Renovate's pull request for that release then stops on it, and whoever reads it removes the catalog, its Renovate rule and the generator's own TypeScript.

## Consequences

- The template gets the generated client the plan names, with the tools the handbook lists.
- The lockfile holds two versions of TypeScript, and `openapi-typescript@7.13.0_typescript@5.9.3` shows the second is held to the generator.
- A product copied from the template carries the same catalog, the same rule and the same generator, until the exception goes.
- Nothing notices a fix for the crash without that test, so the test stays until the exception goes.

## Alternatives considered

- **No generated client for now.** The web app would keep hand-written types until slice 5. No second TypeScript, but slice 2 would miss a part the plan names, and the question would come back.
- **Another generator, such as @hey-api/openapi-ts.** One TypeScript, but a new tool at version 0.99.0, untried on TypeScript 7, and likely to replace openapi-typescript, openapi-fetch and openapi-react-query, which the handbook lists.
