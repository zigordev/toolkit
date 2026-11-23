# The product template

A minimal product, kept inside `toolkit`. It is being built in slices, and this page describes what exists on 2026-11-23: the API and the web app, each as a plain process.

## What it is

A product on the platform is an API and a web app that is one of its clients. The template is the smallest product of that shape, wired with the shared packages of this repo.

| Path                | What it holds                                                                 | Exists  |
| ------------------- | ----------------------------------------------------------------------------- | ------- |
| `apps/template-api` | The API: a Fastify service that answers `GET /health` and `GET /api/v1/hello` | Yes     |
| `apps/template-web` | The web app: a Next.js app whose one page shows what the API says             | Yes     |
| The compose files   | The whole product as it runs everywhere, and what differs on the laptop       | Not yet |

Its product name is `template`, so its apps are `template-api` and `template-web`. Every app has one name, in its folder, its package, its container, its image and its telemetry.

## Why it exists

It has two jobs.

- **It proves the packages.** The template runs on the packages of the same checkout. The pull request that changes a package is therefore checked against a real app, before the package is published.
- **It starts every new product.** A new product begins as a copy of it, so every product has the same shape from its first day.

It stays minimal on purpose, and it is never deployed.

## What it is built with

| Tool               | What it does here                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------- |
| Node.js 26         | Runs both apps. The API's TypeScript files run directly, with no build step              |
| Fastify 5          | Serves the API's routes                                                                  |
| Next.js 16         | Builds the web app, and renders its page on the server at each request                   |
| React 19           | The web app's page                                                                       |
| `@zigordev/config` | Reads each app's settings from the environment once, and stops the app when one is wrong |
| `@zigordev/otel`   | Each app's traces, metrics and log lines, and the answer of its health route             |
| Vitest 5           | Tests the routes and the page, and each app once as a real process                       |

## Quick start

From the root of `toolkit`, after `pnpm install`:

```bash
pnpm build
OTEL_SDK_DISABLED=true OTEL_SERVICE_NAME=template-api HOST=127.0.0.1 pnpm --filter template-api start
```

The first command compiles the shared packages and builds the web app. The second starts the API on port 3000. In a second terminal, start the web app on port 3001 and point it at the API:

```bash
OTEL_SDK_DISABLED=true OTEL_SERVICE_NAME=template-web API_URL=http://127.0.0.1:3000 PORT=3001 pnpm --filter template-web start -H 127.0.0.1
```

Then open `http://127.0.0.1:3001`. The page reads "Hello from template-api", which the web app fetched from the API while it rendered. Stop the API and load the page again: it still renders, and says that the API does not answer.

| Address                              | Answers                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------- |
| `http://127.0.0.1:3000/api/v1/hello` | `{"message":"Hello from template-api"}`                                                       |
| `http://127.0.0.1:3000/health`       | `{"status":"ok","service":"template-api","components":{}}`                                    |
| `http://127.0.0.1:3001/`             | The page                                                                                      |
| `http://127.0.0.1:3001/health`       | `ok` while the API is up, and `degraded` while it is down. Both come with the status code 200 |

`OTEL_SDK_DISABLED=true` keeps telemetry off, because no telemetry agent runs beside the two processes. Running the whole product in containers, behind the ingress and with its telemetry in Grafana, arrives with the compose files.

### The settings

| Variable               | Read by | What it holds                                       | When it is not set     |
| ---------------------- | ------- | --------------------------------------------------- | ---------------------- |
| `OTEL_SERVICE_NAME`    | Both    | The app's one name                                  | The app does not start |
| `OTEL_SERVICE_VERSION` | Both    | The version that runs, shown in its logs and traces | It is left out         |
| `LOG_LEVEL`            | Both    | `debug`, `info`, `warn` or `error`                  | `info`                 |
| `PORT`                 | Both    | The port the app listens on                         | 3000                   |
| `HOST`                 | The API | The address it listens on                           | `0.0.0.0`, every one   |
| `API_URL`              | The web | Where the web app's server reaches the API          | The app does not start |

### How each app starts

Both start the same way: Node.js loads `@zigordev/otel/register` with `--import`, before any code of the app. Telemetry is then in place when the web server is created, so each request gets a span and a duration, in the web app too.

### What slice 1 leaves for later

- **In the API:** the error format, the OpenAPI document, sign-in on every route, and a real resource in place of `hello`. They arrive with `@zigordev/api` and the second slice, in phase 4.
- **In the web app:** the design system, every text in English and Spanish, the content security policy and browser monitoring. They arrive with the fifth slice. Until the second slice brings the generated client, the page calls the API with a plain `fetch`.

### Known limits of the web app's telemetry

- Its duration metric has no route, and the first span of a request is named by its method only. Next.js names the route on a span of its own, one level down.
- It loses its last seconds of telemetry at each stop, and exits with code 143, because Next.js ends the process itself on a SIGTERM.
- The few lines that Next.js prints as it starts are plain text, not JSON.
