# 0017. One PostgreSQL server per product

- Status: accepted
- Date: 2026-11-21
- Supersedes: none

## Context

In November all apps shared one PostgreSQL server, with a database each. No product could start, be upgraded or be restored on its own.

## Decision

Each product runs its own PostgreSQL 18 container, with its own data, its own version and its own backups, and one database and one role per app. No app reads another app's database.

A product may add another data store later, through a decision record. trading-bot will.

## Consequences

- A product starts, backs up and restores alone.
- Each server costs about 150 MB of memory.
- The backup job finds the databases by a label on their containers.

## Alternatives considered

- **A database per app on one shared server.** What November had: less memory, and a shared fate.
