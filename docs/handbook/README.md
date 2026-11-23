# Handbook

The handbook explains the platform piece by piece, for a reader who has never seen it. Read the pages in order and they work as a course.

Every page about a piece has the same five headings:

1. What it is.
2. Why we have it, and what we would lose without it.
3. How it works here, on the laptop and in production.
4. How to use it, with one worked example.
5. How to check that it works, and what to do when it does not.

A package's README follows the same five headings, so for a package the README is its page.

## Reading order

The platform is built in eight phases, and a page is written in the phase that builds its piece. A row with no link is a page that does not exist yet.

| #   | Page                                                | What it explains                                                                                  | Written                                                                                                                                     |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | [The platform](the-platform.md)                     | The whole: the repos, the principles, the names, the contract every app keeps, and the targets    | Yes                                                                                                                                         |
| 2   | [The developer setup](../../packages/dev/README.md) | The `zigordev` command, the shared configs, the git hooks, and the session rules with their guard | Yes, as the package's README                                                                                                                |
| 3   | [The pipeline](the-pipeline.md)                     | The one required check, the jobs behind it, and how a repo calls it                               | Yes                                                                                                                                         |
| 4   | [Packages](packages.md)                             | How shared code is versioned, published from the pipeline and taken up by a product               | Yes                                                                                                                                         |
| 5   | [Dependency updates](dependency-updates.md)         | Renovate: the wait, the hours it may merge in, and what waits for a person                        | Yes                                                                                                                                         |
| 6   | [The laptop platform](the-laptop-platform.md)       | The shared services on the laptop, and the two ways to run a product                              | Yes                                                                                                                                         |
| 7   | [Telemetry](telemetry.md)                           | Logs, traces and metrics from an app to a dashboard and to an alert                               | Yes, for the laptop. Production's side follows in phase 3                                                                                   |
| 8   | Infrastructure                                      | AWS, Cloudflare, GitHub and Grafana as code, and the host                                         | In phase 3                                                                                                                                  |
| 9   | Secrets                                             | Where a secret lives, who sets it and how an app gets it                                          | In phase 3                                                                                                                                  |
| 10  | Delivery                                            | From a merge to a running version, and back                                                       | In phase 3                                                                                                                                  |
| 11  | Backups and recovery                                | What is saved, how a restore is tested, and how the host is rebuilt                               | In phase 3                                                                                                                                  |
| 12  | [APIs](../../packages/api/README.md)                | The Fastify base, errors, paging and the OpenAPI contract                                         | Yes, as the package's README, with the committed OpenAPI file and the generated client in [the template's README](../../template/README.md) |
| 13  | [Data](data.md)                                     | PostgreSQL, migrations and background jobs                                                        | Yes, for PostgreSQL and migrations. Background jobs follow in phase 5                                                                       |
| 14  | [Tests](tests.md)                                   | Unit, API and browser tests, and the helpers they share                                           | Yes, for unit, database and API tests. Browser tests follow in phase 6                                                                      |
| 15  | Email                                               | The notifications service and its client                                                          | In phase 5                                                                                                                                  |
| 16  | The design system                                   | The tokens, the components and Storybook                                                          | In phase 6                                                                                                                                  |
| 17  | Sign-in                                             | Email, passkeys, two-factor and Google                                                            | In phase 6                                                                                                                                  |
| 18  | Feature flags                                       | Shipping unfinished work switched off                                                             | In phase 6                                                                                                                                  |
| 19  | Web apps                                            | Pages, texts in two languages, and browser monitoring                                             | In phase 6                                                                                                                                  |
| 20  | Operations                                          | The drills, the runbooks and the measures                                                         | In phase 7                                                                                                                                  |

## Reference

| Page                                     | What it holds                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| [The tools](tools.md)                    | Every tool of the platform, with exactly what it is used for and where it runs |
| [The decision records](../adr/README.md) | Why each significant decision was taken, and what was not chosen               |
