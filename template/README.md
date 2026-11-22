# The product template

A minimal product, kept inside `toolkit`. It is being built in slices, and this page describes what exists on 2026-11-22: the API.

## What it is

A product on the platform is an API and a web app that is one of its clients. The template is the smallest product of that shape, wired with the shared packages of this repo.

| Path                | What it holds                                                                 | Exists  |
| ------------------- | ----------------------------------------------------------------------------- | ------- |
| `apps/template-api` | The API: a Fastify service that answers `GET /health` and `GET /api/v1/hello` | Yes     |
| `apps/template-web` | The web app: a Next.js app that shows what the API says                       | Not yet |
| The compose files   | The whole product as it runs everywhere, and what differs on the laptop       | Not yet |

Its product name is `template`, so its apps are `template-api` and `template-web`. Every app has one name, in its folder, its package, its container, its image and its telemetry.

## Why it exists

It has two jobs.

- **It proves the packages.** The template runs on the packages of the same checkout. The pull request that changes a package is therefore checked against a real app, before the package is published.
- **It starts every new product.** A new product begins as a copy of it, so every product has the same shape from its first day.

It stays minimal on purpose, and it is never deployed.

## What it is built with

| Tool               | What it does here                                                                  |
| ------------------ | ---------------------------------------------------------------------------------- |
| Node.js 26         | Runs the API's TypeScript files directly. The API has no build step                |
| Fastify 5          | Serves the API's routes                                                            |
| `@zigordev/config` | Reads the API's settings from the environment once, and stops it when one is wrong |
| `@zigordev/otel`   | The API's traces, metrics and log lines, and the answer of its health route        |
| Vitest 5           | Tests the routes through `buildApp()`, and the whole API once as a real process    |

## Quick start

From the root of `toolkit`, after `pnpm install`:

```bash
pnpm build
OTEL_SERVICE_NAME=template-api HOST=127.0.0.1 pnpm --filter template-api start
```

The first command compiles the shared packages, which the API uses in their compiled form. The second starts the API on port 3000. Then, in another terminal:

```bash
curl http://127.0.0.1:3000/api/v1/hello
curl http://127.0.0.1:3000/health
```

The first answers `{"message":"Hello from template-api"}`, and the second `{"status":"ok","service":"template-api","components":{}}`.

No telemetry agent runs beside it yet, so OpenTelemetry says on the error output that it cannot send. Add `OTEL_SDK_DISABLED=true` in front of the command to keep it quiet. Running the whole product in containers, behind the ingress and with its telemetry in Grafana, arrives with the compose files.

### The API's settings

| Variable               | What it holds                                       | When it is not set     |
| ---------------------- | --------------------------------------------------- | ---------------------- |
| `OTEL_SERVICE_NAME`    | The app's one name                                  | The API does not start |
| `OTEL_SERVICE_VERSION` | The version that runs, shown in its logs and traces | It is left out         |
| `PORT`                 | The port it listens on                              | 3000                   |
| `HOST`                 | The address it listens on                           | `0.0.0.0`, every one   |
| `LOG_LEVEL`            | `debug`, `info`, `warn` or `error`                  | `info`                 |

### What slice 1 leaves for later

The API standard arrives with `@zigordev/api` and the template's second slice, in phase 4: the error format, the OpenAPI document, sign-in on every route, and a real resource in place of `hello`.
