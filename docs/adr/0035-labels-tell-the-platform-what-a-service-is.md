# 0035. Labels tell the platform what a service is

- Status: proposed
- Date: 2026-11-23
- Supersedes: none

## Context

A product's `compose.yaml` describes the whole product. Two jobs of the platform have to find services in it, with no list kept anywhere else:

- **The deploy** (step 3.7 of the build plan) has to run a product's migration job once, before the new version starts, and stop when the job fails. The job runs the app's own image and ends after its work. `zigordev contract` takes every service on a `ghcr.io/zigordev/` image for an app, so it would hold the job to the six promises of an app, and the job would fail them.
- **The backup** (step 3.8) has to find every product's PostgreSQL and dump it each hour. [Record 0017](0017-one-postgresql-server-per-product.md) says that it finds the databases by a label, but not which label, nor how the job gets in without a secret.

The two lanes of the build agreed on both on 2026-11-23.

## Decision

The platform reads two labels on a service in `compose.yaml`. Both start with `com.zigordev.`, Docker's advice for a tool's own labels: the reverse of a domain the owner holds. The ingress keeps its own `traefik.*` labels.

**`com.zigordev.job: migrate`** marks a one-shot job, not an app.

- It is a service named `<app>-migrate`. It runs its app's image with its own command, and `restart: "no"`. The value names the kind of job, and `migrate` is the only kind.
- On the laptop and in the contract run, the app says `depends_on: { <app>-migrate: { condition: service_completed_successfully } }`, so `docker compose up` runs the job first and stops when it fails.
- In production, `compose.production.yaml` resets that with `depends_on: !reset []`. The deploy starts the data stores and waits for their health checks, runs each job once with the new version, `docker compose run --rm --no-deps <job>`, and stops on an exit code other than 0, with the old version still serving. Only then does docker-rollout start the new containers.
- `zigordev contract` leaves jobs out of the apps, and holds a job to two promises of its own: it ends with code 0 before its app starts, and every line it prints is JSON.

**`com.zigordev.backup: postgres`** marks a PostgreSQL to back up. The value names the kind of store, so the job knows which dump tool to run.

- A product never sets `POSTGRES_USER`, so the superuser is always `postgres`. Each app's own role and database are made by its migrate job.
- A timer on the host finds the running containers with the label, names each dump after the container's `com.docker.compose.project`, and runs `pg_dumpall --globals-only` and one `pg_dump --format=custom` per database through `docker exec --user postgres`. The official image trusts a connection over the socket inside its own container, so this needs no password.

## Consequences

- A new product is deployed and backed up with no setup beyond its compose file, and a reader sees there what the platform does with each service.
- No secret is needed for the backup, and the dump always runs the server's own `pg_dump`, so their versions match.
- The dump runs inside the store's container, within its memory limit. That limit is higher than the database needs at rest, to leave room for it.
- `pg_dumpall --globals-only` holds the roles' password hashes, so the bucket is private and encrypted with its own key, and the copy outside AWS is encrypted before it leaves.
- A product must not change how its PostgreSQL authenticates on the local socket, or the backup stops working.
- A migration runs while the old version still serves, so it keeps the old version working: add first, switch over, remove later, as the data rules say.
- `zigordev contract` changes in a release of `@zigordev/dev`, and the template's compose files get a job and a store with the notes API.

## Alternatives considered

- **Find the job by a name that ends in `-migrate`.** No label, but the rule is invisible in the file.
- **Treat a service that another one waits for with `service_completed_successfully` as a job.** No new word, but the deploy and the contract would have to work it out, and a reader cannot see it.
- **Put the jobs in a compose profile.** An app's `depends_on` on a service in a profile that is not switched on breaks `docker compose up` on the laptop.
- **A backup role per product, with its password in Parameter Store, dumped over the network.** It would still work if a database left the host, but it is one more secret per product to set and rotate, a client image to keep in step with the server, and a job that joins every product's network.
- **A backup container inside each product.** It costs memory in every product, and it needs AWS credentials inside a container, which the infrastructure rules forbid.
