# The product template

A minimal product, kept inside `toolkit`. It is being built in slices, and this page describes what exists on 2026-11-23: the API and the web app, their images, and the compose files that run both as containers behind the shared services.

## What it is

A product on the platform is an API and a web app that is one of its clients. The template is the smallest product of that shape, wired with the shared packages of this repo.

| Path                                 | What it holds                                                                                                                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/template-api`                  | The API: a Fastify service on `@zigordev/api` with a greeting behind a feature flag and the notes, its flags in `flags.json`, its migrations in `drizzle/`, its `openapi.json` and its `Dockerfile` |
| `apps/template-web`                  | The web app: a Next.js app whose one page shows what the API says, and the `Dockerfile` of it                                                                                                       |
| `packages/template-api-client`       | The API's typed client: the types written from `openapi.json`, and `createTemplateApiClient()` on openapi-fetch                                                                                     |
| `packages/template-client-generator` | The one package that writes those types, with openapi-typescript on its own TypeScript 5.9.3                                                                                                        |
| `compose.yaml`                       | The whole product as it runs everywhere: both apps, the API's migrate job and the product's PostgreSQL, each with its limits and health check                                                       |
| `compose.local.yaml`                 | What differs on the laptop: the images are built here, and the address is `template.localhost`                                                                                                      |
| `compose.production.yaml`            | What differs in production: the address, and that the deploy runs the migrate job itself                                                                                                            |
| `compose.test.ts`                    | The test that holds the three compose files and the two Dockerfiles to the container rules                                                                                                          |
| `package.json`                       | The scripts `local:up`, `local:down`, `local:reset` and `check:contract`                                                                                                                            |
| `.env.production.example`            | The names of the secrets that production needs. Only the names: the values live in AWS Parameter Store                                                                                              |
| `.github/workflows/ci.yml`           | The product's caller: the pipeline on every pull request, then publish and deploy on every merge to `main`                                                                                          |

Its product name is `template`, so its apps are `template-api` and `template-web`. Every app has one name, in its folder, its package, its compose service, its image and its telemetry.

## Why it exists

It has two jobs.

- **It proves the packages.** The template runs on the packages of the same checkout. The pull request that changes a package is therefore checked against a real app, before the package is published.
- **It starts every new product.** A new product begins as a copy of it, so every product has the same shape from its first day.

It stays minimal on purpose, and it is never deployed. Its `.github/workflows/ci.yml` runs only in a product made from it: GitHub reads workflows at the root of a repo, and the template's folder is not one.

## What it is built with

| Tool               | What it does here                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| Node.js 26         | Runs both apps. The API's TypeScript files run directly, with no build step                              |
| Fastify 5          | Serves the API's routes                                                                                  |
| Next.js 16         | Builds the web app, and renders its page on the server at each request                                   |
| React 19           | The web app's page                                                                                       |
| `@zigordev/config` | Reads each app's settings from the environment once, and stops the app when one is wrong                 |
| `@zigordev/otel`   | Each app's traces, metrics and log lines, and the answer of its health route                             |
| `@zigordev/api`    | The API's base: the error format, paging, sign-in checks, the OpenAPI pages, the database and the stop   |
| PostgreSQL 18      | The product's database, in a container of its own on a network of its own                                |
| Drizzle            | The API's queries, and with drizzle-kit the SQL of each migration                                        |
| `@zigordev/test`   | A real PostgreSQL for the API's tests, with one migrated copy per test file                              |
| Docker Compose     | Runs the product as one project of two containers, on the network of the shared services                 |
| The Node.js image  | The official image on Alpine Linux, at the same Node.js version as `mise.toml`. Both images are built on |
| Vitest 5           | Tests the routes and the page, each app once as a real process, and the compose files                    |

## Quick start

There are two ways to run it. The first is the product as it runs in production, in containers. The second is the two apps as plain processes, which needs no Docker.

### In containers, behind the shared services

It needs Docker. The shared services come with it: the ingress, the telemetry agent and Grafana are the package `@zigordev/stack`, which [platform](https://github.com/zigordev/platform) publishes and this folder takes from npm. From this folder:

```bash
pnpm local:up
```

The script has two halves. `zigordev-stack up` starts the shared services and waits until each one is healthy. When they already run, it changes nothing. `docker compose up` then builds both images, starts both containers, and returns when both are healthy. The first build takes a few minutes, most of them downloads.

| Address                                  | Answers                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `http://template.localhost`              | The page. It reads "Hello from template-api"                                                      |
| `http://template.localhost/api/v1/hello` | The API, at the same address as the page: `{"message":"Hello from template-api"}`                 |
| `http://template.localhost/health`       | The web app's health: `ok` while the API is up, and `degraded` while it is down                   |
| `http://grafana.localhost`               | Grafana. The dashboard named App, in the folder zigordev, lists `template-api` and `template-web` |

`pnpm local:down` stops and removes the two containers, and leaves the shared services running, because other products use them. `pnpm local:reset` does the same, removes the product's volumes, and starts it again.

[The laptop platform](../docs/handbook/the-laptop-platform.md) explains the shared services and what an app does to be served. [Telemetry](../docs/handbook/telemetry.md) follows one request of this template through Grafana, as a trace, a log line and a metric.

### While you edit one app: hot reload

With the product up in containers, run the one app you are editing on this Mac itself. From this folder:

```bash
pnpm dev web
pnpm dev api
```

| Command        | What runs                                                   | Its address             | A saved change                               |
| -------------- | ----------------------------------------------------------- | ----------------------- | -------------------------------------------- |
| `pnpm dev web` | `next dev`, the web app's dev server                        | `http://127.0.0.1:3001` | Shows on the next look at the page, at once  |
| `pnpm dev api` | The API under `node --watch`, which restarts it on a change | `http://127.0.0.1:3000` | The API answers with it about a second later |

No image is built, and the rest of the product keeps running in its containers, behind the shared services. `pnpm dev` alone says how to name the app.

By default the web app's dev server asks the API in its container, through the ingress at `http://template.localhost`. So `pnpm local:up` has to run first. To see a change of the API on the page, run both: `pnpm dev api` in one terminal, and this in a second:

```bash
API_URL=http://127.0.0.1:3000 pnpm dev web
```

Each app reads its dev settings from its own `.env.development`. The file holds no secret, so it is committed. The app checks those settings with the same schema as in its container, and a variable set in the shell wins over the file. A missing setting stops the app with the same message as in its container. The API's watcher then waits for a change of a file before it tries again.

A dev process differs from its container in a few ways, all on purpose:

| What                | In its container                       | With `pnpm dev`                                                             |
| ------------------- | -------------------------------------- | --------------------------------------------------------------------------- |
| Where it listens    | Port 3000, reached through the ingress | `127.0.0.1` only, so nothing outside this Mac reaches it                    |
| Its version         | `local`                                | `dev`, so Grafana tells the two copies apart                                |
| Its log lines       | Read by the agent, and kept in Grafana | Printed in the terminal, where the agent does not read them                 |
| The API's telemetry | Sent to the agent at `alloy:4318`      | Sent to the agent at `127.0.0.1:4318`, giving up on a send after one second |
| The web's telemetry | Sent to the agent                      | None: `next dev` runs without `@zigordev/otel/register`, see below          |

The web app's dev server sends no traces and no metrics. `next dev` compiles a page the first time it is asked for, so its timings say nothing about the app. And the register entry turns every line printed to the console into a JSON line, which would hide the compiler's messages from the person reading the terminal. To see the web app's telemetry, run it in its container.

The API's dev process sends to the agent's port on this Mac, `127.0.0.1:4318`. The shared services publish it from `@zigordev/stack` 1.1.0 on, which the template takes. When the agent cannot be reached there, the dev API writes one error line a minute about it, and carries on. That happens while the shared services are stopped, or when they were last started by a product that holds an older `@zigordev/stack`. The short send timeout keeps a restart at about a second either way.

## The settings

| Variable                      | Read by          | What it holds                                                                | When it is not set                              |
| ----------------------------- | ---------------- | ---------------------------------------------------------------------------- | ----------------------------------------------- |
| `OTEL_SERVICE_NAME`           | Both             | The app's one name                                                           | The app does not start                          |
| `OTEL_SERVICE_VERSION`        | Both             | The version that runs, shown in its logs, traces and metrics                 | It is left out                                  |
| `LOG_LEVEL`                   | Both             | `debug`, `info`, `warn` or `error`                                           | `info`                                          |
| `PORT`                        | Both             | The port the app listens on                                                  | 3000                                            |
| `HOST`                        | The API          | The address it listens on                                                    | `0.0.0.0`, every one                            |
| `DATABASE_URL`                | The API, the job | The address of the app's database, as its own role                           | The app does not start                          |
| `API_KEYS`                    | The API          | The callers it knows, as JSON: a name, the SHA-256 of the key and the scopes | Nobody, so every notes request gets 401         |
| `FLAGS_FILE`                  | The API          | The path of its flags file                                                   | Its own `flags.json`, beside its `package.json` |
| `DATABASE_ADMIN_URL`          | The job          | The superuser's address, to make the app's role and database                 | The job only migrates                           |
| `API_URL`                     | The web          | Where the web app's server reaches the API                                   | The app does not start                          |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry    | Where the telemetry goes. The compose file names the agent                   | `http://localhost:4318`                         |
| `OTEL_RESOURCE_ATTRIBUTES`    | OpenTelemetry    | The environment the app runs in, as `local` or `production`                  | It is left out                                  |

The compose files set every one of them that a container needs. An app reads nothing but environment variables.

## The notes API

Slice 2 gives the API its first real feature: notes, kept in the product's PostgreSQL.

| Method and path                 | Operation    | Scope         | Answers                              |
| ------------------------------- | ------------ | ------------- | ------------------------------------ |
| `GET /api/v1/notes`             | `listNotes`  | `notes:read`  | 200 with a page of notes             |
| `POST /api/v1/notes`            | `createNote` | `notes:write` | 201 with the note and its `Location` |
| `GET /api/v1/notes/{noteId}`    | `getNote`    | `notes:read`  | 200 with the note, or 404            |
| `PATCH /api/v1/notes/{noteId}`  | `updateNote` | `notes:write` | 200 with the changed note, or 404    |
| `DELETE /api/v1/notes/{noteId}` | `deleteNote` | `notes:write` | 204, or 404                          |

A list filters by `status` and by `q`, a text that the title holds in any case, sorts by `createdAt`, `updatedAt` or `title`, newest first unless asked, and pages with `limit` and `cursor`. Every error is a problem in the platform's format, and the docs page at `/api/v1/docs` shows them all.

A caller signs in with an API key in `Authorization: Bearer <key>`. The API keeps only the SHA-256 of each key, in `API_KEYS`, so the key itself is never in a setting the API reads. To try the notes on this Mac, make a key and start the API with it:

```bash
KEY=$(openssl rand -hex 16)
DIGEST=$(printf '%s' "$KEY" | shasum -a 256 | cut -d' ' -f1)
API_KEYS="[{\"name\":\"me\",\"sha256\":\"$DIGEST\",\"scopes\":[\"notes:read\",\"notes:write\"]}]" pnpm dev api
```

Then `curl -H "authorization: Bearer $KEY" http://127.0.0.1:3000/api/v1/notes` lists the notes.

### The database

The product's PostgreSQL runs as `template-postgres`, on the network `template`, which only the API and its job join. On the laptop it also answers at `127.0.0.1:5433`, so that `pnpm dev api` reaches it. The API connects as its own role, `template_api`, to its own database, `template_api`.

Before the API starts, the one-shot job `template-api-migrate` runs on the API's own image: it makes the role and the database when they are missing, and applies the migrations in `apps/template-api/drizzle/`. On the laptop the API waits for it. In production the deploy runs it once, before the new version starts, and stops when it fails. The handbook page [Data](../docs/handbook/data.md) explains why.

A change to the tables is a migration, and a change to a route regenerates the OpenAPI file:

```bash
pnpm --dir apps/template-api run db:generate --name add_notes_pinned
pnpm --dir apps/template-api run openapi
```

The first writes the SQL of a schema change into `drizzle/`, which is read and committed as it is. The second writes `openapi.json`, and a test fails while the file and the code differ.

### The client

`packages/template-api-client` is the typed client of the API. Its types are written from `openapi.json`, so a changed endpoint breaks the code that calls it when it compiles, not in production:

```ts
import { createTemplateApiClient } from 'template-api-client';

const api = createTemplateApiClient({ baseUrl: 'http://template-api:3000', key });
const { data, error } = await api.GET('/api/v1/notes', { params: { query: { status: 'open' } } });
```

After a change to `openapi.json`, write the types again with `pnpm --dir packages/template-api-client run generate`. A test fails while they differ from the file. The generator runs on TypeScript 5.9.3, because openapi-typescript does not run on TypeScript 7. [Record 0036](../docs/adr/0036-the-client-generator-runs-on-its-own-typescript-5.md) says why, and when that ends.

## The feature flags

The API keeps its flags in `apps/template-api/flags.json`, and reads them in the app through [`@zigordev/flags`](../packages/flags/README.md). Its image carries the file, so a flag changes through a pull request and takes effect with the deploy. No flag server runs.

The template has one flag, `friendly-greeting`, and it is off. `GET /api/v1/hello` answers `Hello from template-api` while it is off, and `Hi there, from template-api` once a pull request sets its `defaultVariant` to `on`. It is the smallest example of a feature that ships switched off.

Every flag carries a removal date in `metadata.removeBy`. The `flags` rule of `zigordev check` fails `pnpm check` on a flag past its date, so `friendly-greeting` has to go, or its date has to move, by 2027-11-30. A product made from the template removes it with its first real flag.

A test sets a flag by pointing `FLAGS_FILE` at a file of its own, as the API's `app.test.ts` does for the friendly greeting.

## How each app starts

Both start the same way: Node.js loads `@zigordev/otel/register` with `--import`, before any code of the app. Telemetry is then in place when the web server is created, so each request gets a span and a duration, in the web app too. The last line of each `Dockerfile` is that same command.

An app that misses a setting stops at once: it writes which settings are wrong to its error output, and ends with code 1 before it takes a request. The API gets this from Node.js, which ends a process on an error that nobody caught. Next.js catches what its start hook throws and carries on, so the web app ends the process itself. Its start hook is `src/instrumentation.ts`, and the part of it that only Node.js can run is `src/lib/start.ts`.

The API's start lives in `src/start.ts` too. `start()` reads the settings, builds the app, listens and writes `service.started`. The server it returns has a `stop()`, which writes `service.stopping`, closes the app, sends the last telemetry and gives the exit code. `stopOnSignals()` calls it on a SIGTERM or a SIGINT. `src/main.ts` is the two lines that join them.

That keeps every line that does something inside the tests' reach. A test that starts `src/main.ts` as a process of its own proves the real start and stop, but coverage cannot see inside that process. A product copied from the template counts the coverage of its apps alone, against the same floor of 90%, so it starts with a check that passes.

## How it runs in containers

`compose.yaml` describes each service once, the way it runs everywhere. The other two files hold only what differs.

| What                 | In `compose.yaml`                                                                                                                                    | Why                                                                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The image            | `ghcr.io/zigordev/<app>:${VERSION:-local}`                                                                                                           | One image per app, tagged with the version that runs                                                                                                                 |
| The version          | `VERSION` also becomes `OTEL_SERVICE_VERSION`                                                                                                        | The telemetry names the same version as the image. A laptop build is `local`                                                                                         |
| The user             | `user: "1000:1000"`, the user `node` of the image                                                                                                    | Nothing runs as root                                                                                                                                                 |
| The file system      | `read_only: true`. Each app gets `/tmp` in memory, of 1 MiB, for the drain below, and the web app one more folder of 64 MiB for the cache of Next.js | A process that is broken into can change no file                                                                                                                     |
| The privileges       | `cap_drop: [ALL]` and `no-new-privileges`                                                                                                            | The process holds no special right and can gain none                                                                                                                 |
| The first process    | `init: true`                                                                                                                                         | Signals reach the app, and no dead child process stays behind                                                                                                        |
| The stop             | `stop_grace_period: 30s`                                                                                                                             | The app gets 30 seconds to finish its requests after a SIGTERM                                                                                                       |
| The limits           | 256 MiB and one CPU for the API, 384 MiB and one CPU for the web app                                                                                 | One app can never take the host down                                                                                                                                 |
| The health check     | It fails while `/tmp/drain` exists, and otherwise `wget` asks `http://127.0.0.1:3000/health`, every 10 seconds                                       | Compose and the deploy know when the app can take requests, and the ingress stops sending it requests while it drains                                                |
| The drain            | The label `docker-rollout.pre-stop-hook: "touch /tmp/drain && sleep 35"`                                                                             | On a deploy, docker-rollout writes `/tmp/drain` in the old container. Its health check fails within 30 seconds, the ingress takes it out, and only then does it stop |
| The restart          | `restart: unless-stopped`, for both apps and the database. The migrate job keeps `restart: "no"`                                                     | The host restarts itself at night for its updates, and everything comes back                                                                                         |
| Images of others     | The database's image is pinned by its digest: `postgres:18.7-alpine3.24@sha256:…`. The API's tests read it from `compose.yaml`                       | The host runs exactly the image that was checked, and the tests run the same one. Renovate proposes a new digest                                                     |
| The route            | Two labels: `traefik.enable`, and the port the app listens on                                                                                        | The ingress finds the app by its labels. No port is published                                                                                                        |
| The network          | `zigordev`, which the shared services create                                                                                                         | The ingress and the telemetry agent are reached by name on it                                                                                                        |
| The telemetry target | `OTEL_EXPORTER_OTLP_ENDPOINT: http://alloy:4318`                                                                                                     | Every app sends to the agent, and never to Grafana itself                                                                                                            |

`compose.local.yaml` adds how each image is built, the environment name `local`, and the address: the web app answers at `template.localhost`, and the API at the same address under `/api`. `compose.production.yaml` adds the environment name `production` and the address `template.zigordev.com`. The API's own health route is not reachable from outside: `/health` at the product's address is the web app's.

The limits come from a measurement. On 2026-11-23, after 800 requests through the ingress, the API held 65 MiB and the web app 110 MiB.

### How the images are built

Both images are built from the root of `toolkit`, not from this folder, because the apps use the packages of this checkout. That is why `compose.local.yaml` names the folder above as the build context. Each `Dockerfile` has its own ignore file beside it, `Dockerfile.dockerignore`, which keeps `.git`, the docs, the tests and every `node_modules` out of the build.

Each `Dockerfile` has two stages on the same Node.js image.

1. **The build stage** installs pnpm at the version that `package.json` pins, installs from the lockfile, compiles the shared packages, and then runs `pnpm deploy --prod`. That command writes one self-contained folder: the app with its production dependencies only.
2. **The final stage** takes the current Alpine packages, removes npm, copies that folder in, and switches to the user `node`.

The web app's build stage has one more step. Next.js keeps a few modules outside its bundle, such as the logger, and links to them from `.next/node_modules` by a path relative to where it was built. So the web app is built inside a deployed copy of itself, where those paths are the ones the image has.

Inside that copy the build script runs through Node.js itself, with `node --run build`, and not through pnpm. pnpm installs a folder once more before it runs a script there, and the copy does not carry this repo's settings. In a product, where our own packages come from npm, that second install failed for a day after each of our releases: the copy did not know that `@zigordev/*` is exempt from pnpm's one-day wait. `pnpm deploy` has already installed the copy, under the settings of the repo, so nothing is skipped.

| Image          | Size as stored and sent | Built for |
| -------------- | ----------------------- | --------- |
| `template-api` | 79 MB                   | arm64     |
| `template-web` | 167 MB                  | arm64     |

## How it reaches production

In a product made from the template, `.github/workflows/ci.yml` runs four jobs. On a pull request, the pipeline and its gate `check`. On a merge to `main`, also Publish, which builds both images for arm64, pushes them as `ghcr.io/zigordev/<app>:<commit>` and attests them, and then Deploy, which verifies them, asks the host to run the commit, and checks `https://<product>.zigordev.com/health` from outside. [Delivery](../docs/handbook/delivery.md) explains each step, and the four things a product needs before its first deploy.

The three workflows are `toolkit`'s, pinned to one commit of it, and Renovate moves all three together.

## The contract test

Every app on the platform keeps twelve promises, and [the platform page](../docs/handbook/the-platform.md) lists them. The first six are checked on the images themselves, and promise 7 on the compose files and on each app that the ingress routes:

```bash
pnpm check:contract
```

It builds both images, starts them once more under the name `template-contract`, on a network of their own, and holds each app to the promises with `zigordev contract`. It first reads `compose.yaml` and `compose.production.yaml` together, as the host does, and checks the rules of the deploy and the backup that [Delivery](../docs/handbook/delivery.md) lists. A product that already runs at `template.localhost` is not touched. It takes about half a minute once the images are built, and it needs Docker running, but not the shared services. This is its output on 2026-11-25:

```text
the compose files
  kept    7  compose.yaml names the product template, which is its project's name on the host
  kept    7  our images and their OTEL_SERVICE_VERSION follow VERSION: ghcr.io/zigordev/template-api and ghcr.io/zigordev/template-web
  kept    7  every other image is pinned by its digest: postgres
  kept    7  every long-running service restarts unless stopped, and a job never does
  kept    7  template-api and template-web drain before they stop: no fixed name or port, /tmp in memory, and the pre-stop hook of docker-rollout
  kept    7  .env.production.example names 3 secrets, with no value, and the compose files use no other
  kept    7  compose.production.yaml routes template-api and template-web to template.zigordev.com
  kept    7  template-postgres carries the label com.zigordev.backup: postgres, so the backup on the host finds it
template-api
  kept    1  an arm64 image that runs as the user 1000:1000
  kept    2  without its settings it stops at once, with code 1
  kept    3  it listens on the port in PORT, and answers GET /health with 200 and its version local
  kept    4  7 lines, all JSON, with nothing a visitor sent
  kept    5  traces and metrics reached the agent under the name template-api
  kept    6  it stopped 1.4 s after a SIGTERM with code 0, and answered the request it had begun
  kept    7  its health check fails while /tmp/drain exists, and passes again once it is gone
template-web
  kept    1  an arm64 image that runs as the user 1000:1000
  kept    2  without its settings it stops at once, with code 1
  kept    3  it listens on the port in PORT, and answers GET /health with 200 and its version local
  kept    4  6 lines, all JSON, with nothing a visitor sent
  kept    5  traces and metrics reached the agent under the name template-web
  kept    6  it stopped 1.4 s after a SIGTERM with code 143, and answered the request it had begun
  kept    7  its health check fails while /tmp/drain exists, and passes again once it is gone
template-api-migrate, a job
  kept    1  it ended with code 0 before template-api started
  kept    2  4 lines, all JSON
zigordev contract: 2 apps keep promises 1 to 7, the compose files keep promise 7, and 1 job keeps promises 1 and 2
```

The pipeline runs the same script on every pull request, in a job named Contract, on an arm64 machine. [The developer setup](../packages/dev/README.md) says what the command does to see each promise.

## What is left for later

- **In the web app:** the notes pages, the design system, every text in English and Spanish, the content security policy and browser monitoring. They arrive with the fifth slice. Until then the page calls the API with a plain `fetch`.
- **Sign-in for people.** The API knows callers by their API keys. People sign in with the third slice, in phase 6.

## Known limits

- The web app's duration metric has no route, and the first span of a request is named by its method only. Next.js names the route on a span of its own, one level down.
- The web app loses its last seconds of telemetry at each stop, and exits with code 143, because Next.js ends the process itself on a SIGTERM.
- More than half of the web image is Next.js. Its compiler alone is 87 MB unpacked, and a running app does not use it.
