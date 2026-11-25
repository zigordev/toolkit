# Decision records

Each significant decision gets one short record: the context, the decision, its consequences and the alternatives that were not taken. A record is written for a reader who was not there.

The records are numbered from 0001. An accepted record is never edited: a new record supersedes it by naming it, and this index then marks the old one as superseded. The first records are the decisions of the plan for the restart of 2026-11-21, which the owner took one at a time.

To add one, use the `write-decision-record` skill, or copy [its template](../../.claude/skills/write-decision-record/template.md) to `NNNN-short-title.md` with the next free number, and add a row here in the same pull request.

| #                                                                              | Decision                                                                 | Date       | Status             |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ---------- | ------------------ |
| [0001](0001-production-runs-on-aws-sized-small.md)                             | Production runs on AWS, sized small                                      | 2026-11-21 | accepted           |
| [0002](0002-two-environments-the-laptop-and-production.md)                     | Two environments: the laptop and production                              | 2026-11-21 | accepted           |
| [0003](0003-three-shared-repos.md)                                             | Three shared repos: toolkit, platform and notifications                  | 2026-11-21 | accepted           |
| [0004](0004-one-repo-per-product.md)                                           | One repo per product                                                     | 2026-11-21 | accepted           |
| [0005](0005-the-personal-github-account-owns-the-repos.md)                     | The personal GitHub account owns the repos                               | 2026-11-21 | accepted           |
| [0006](0006-new-products-start-from-a-template.md)                             | New products start from a template in toolkit                            | 2026-11-21 | accepted           |
| [0007](0007-packages-on-public-npm-unlicensed.md)                              | Packages go to the public npm registry, unlicensed                       | 2026-11-21 | accepted           |
| [0008](0008-one-version-published-on-every-merge.md)                           | One version for all packages, published on every merge                   | 2026-11-21 | accepted           |
| [0009](0009-a-pull-request-merges-on-green.md)                                 | A pull request merges when its check is green                            | 2026-11-21 | accepted           |
| [0010](0010-every-green-merge-deploys.md)                                      | Every green merge of a product deploys it                                | 2026-11-21 | accepted           |
| [0011](0011-the-pipeline-pushes-each-deploy.md)                                | The pipeline pushes each deploy through AWS Systems Manager              | 2026-11-21 | accepted           |
| [0012](0012-renovate-merges-small-updates-in-working-hours.md)                 | Renovate merges patch and minor updates in working hours                 | 2026-11-21 | accepted           |
| [0013](0013-cloudflare-tunnel-into-traefik.md)                                 | Traffic arrives through a Cloudflare Tunnel into Traefik                 | 2026-11-21 | accepted           |
| [0014](0014-one-address-per-product.md)                                        | One address per product, with the API under /api/v1                      | 2026-11-21 | accepted           |
| [0015](0015-one-small-host-on-ubuntu.md)                                       | One small host on Ubuntu LTS, stepping up on memory                      | 2026-11-21 | accepted           |
| [0016](0016-arm64-images-and-typescript-run-directly.md)                       | Images are built for arm64, and services run their TypeScript directly   | 2026-11-21 | accepted           |
| [0017](0017-one-postgresql-server-per-product.md)                              | One PostgreSQL server per product                                        | 2026-11-21 | accepted           |
| [0018](0018-secrets-in-aws-parameter-store.md)                                 | Production secrets live in AWS Parameter Store                           | 2026-11-21 | accepted           |
| [0019](0019-email-through-the-notifications-service.md)                        | Email goes through the notifications service                             | 2026-11-21 | accepted           |
| [0020](0020-sign-in-with-email-passkeys-and-google.md)                         | Sign-in offers email, passkeys, two-factor and Google                    | 2026-11-21 | accepted           |
| [0021](0021-one-flagd-per-product.md)                                          | One flagd per product                                                    | 2026-11-21 | accepted           |
| [0022](0022-design-system-starts-small-with-storybook.md)                      | The design system starts with the colours and a Button, with Storybook   | 2026-11-21 | accepted           |
| [0023](0023-hourly-backups-and-a-monthly-restore-test.md)                      | Hourly backups, a monthly restore test and a copy outside AWS            | 2026-11-21 | accepted           |
| [0024](0024-alerts-reach-the-phone-through-grafana.md)                         | Alerts reach the phone through Grafana, with email as the fallback       | 2026-11-21 | accepted           |
| [0025](0025-grype-scans-the-images.md)                                         | Grype scans the images                                                   | 2026-11-21 | accepted           |
| [0026](0026-docs-are-markdown-in-each-repo.md)                                 | Docs are Markdown in each repo                                           | 2026-11-21 | accepted           |
| [0027](0027-session-notes-hold-only-what-no-repo-can.md)                       | Session notes hold only what no repo can hold                            | 2026-11-21 | accepted           |
| [0028](0028-translations-checked-by-inlang-edited-in-fink.md)                  | Translations are checked by inlang and edited in Fink                    | 2026-11-22 | accepted           |
| [0029](0029-codeql-stays-on-while-a-repo-is-public.md)                         | CodeQL stays on while a repo is public and earns nothing                 | 2026-11-22 | accepted           |
| [0030](0030-no-console-for-feature-flags-for-now.md)                           | No console for feature flags for now                                     | 2026-11-22 | accepted           |
| [0031](0031-the-pipeline-allows-only-agreed-licences.md)                       | The pipeline allows only agreed licences                                 | 2026-11-22 | superseded by 0032 |
| [0032](0032-no-licence-gate-for-now.md)                                        | No licence gate for now                                                  | 2026-11-22 | accepted           |
| [0033](0033-a-flawed-dependency-of-a-dependency-is-replaced-by-an-override.md) | A flawed dependency of a dependency is replaced by an override           | 2026-11-22 | accepted           |
| [0034](0034-the-pipeline-and-the-host-run-one-named-ubuntu-lts.md)             | The pipeline and the host run one named Ubuntu LTS                       | 2026-11-23 | accepted           |
| [0035](0035-labels-tell-the-platform-what-a-service-is.md)                     | Labels tell the platform what a service is                               | 2026-11-23 | accepted           |
| [0037](0037-a-migration-that-deletes-data-waits-for-the-owners-label.md)       | A migration that deletes data waits for the owner's label                | 2026-11-23 | accepted           |
| [0036](0036-the-client-generator-runs-on-its-own-typescript-5.md)              | The client generator runs on its own TypeScript 5                        | 2026-11-23 | accepted           |
| [0038](0038-images-of-others-are-pinned-by-their-digest.md)                    | Images of others are pinned by their digest                              | 2026-11-24 | accepted           |
| [0039](0039-apache-kafka-is-the-broker-one-node-on-the-host.md)                | Apache Kafka is the broker, one node on the host                         | 2026-11-25 | proposed           |
| [0040](0040-apps-use-kafka-only-through-zigordev-events.md)                    | Apps use Kafka only through `@zigordev/events`, on `@platformatic/kafka` | 2026-11-25 | proposed           |
| [0041](0041-each-app-signs-in-to-kafka-with-its-own-password.md)               | Each app signs in to Kafka with its own password                         | 2026-11-25 | proposed           |
| [0042](0042-notifications-takes-requests-and-gives-outcomes-over-kafka.md)     | Notifications takes requests and gives outcomes over Kafka               | 2026-11-25 | proposed           |
| [0043](0043-the-host-steps-up-to-a-t4g-medium-when-the-broker-arrives.md)      | The host steps up to a t4g.medium when the broker arrives                | 2026-11-25 | proposed           |
| [0044](0044-live-updates-reach-pages-as-server-sent-events.md)                 | Live updates reach pages as Server-Sent Events                           | 2026-11-25 | proposed           |
| [0045](0045-mobile-apps-are-built-with-expo-beside-the-web-app.md)             | Mobile apps are built with Expo, beside the web app                      | 2026-11-25 | proposed           |
