# 0023. Hourly backups, a monthly restore test and a copy outside AWS

- Status: accepted
- Date: 2026-11-21
- Supersedes: none

## Context

The worst case is losing the host. gpool holds the data of 64 real users. The targets decide how often backups run and how fast a rebuild has to be.

## Decision

The targets: at most 1 hour of data lost, and everything running again within 1 hour.

- Every database is dumped to S3 every hour, and a dump is kept for 30 days.
- The data disk gets a daily snapshot, kept for 7 days.
- Once a month the newest dump is restored into a throwaway container, and its row counts are compared.
- From the day gpool's data returns, the dumps are also copied each night, encrypted, to Cloudflare R2.
- The host is recreated from code, attaches the data disk and redeploys every app at its recorded version.

## Consequences

- An alert fires when the newest dump is older than 2 hours, and when the last good restore is older than 35 days.
- The owner keeps the key that decrypts the outside copy, outside both clouds.
- Deleted data is gone from every backup within 30 days.
- The rebuild is rehearsed once in phase 3, and again whenever the base image changes.

## Alternatives considered

- **1 day of data, back in 4 hours.** Nightly dumps and a relaxed rebuild: the simplest setup.
- **Minutes of data, back in 1 hour.** The database's change log would be shipped all the time. It waits for a product that cannot lose an hour.
- **Keep dumps for 7 days, or for 90 days with a weekly restore test.** Less history, or more history and more testing.
- **No copy outside AWS.** Every backup would sit with the one provider whose account could be lost.
