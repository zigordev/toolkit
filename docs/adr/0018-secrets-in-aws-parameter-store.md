# 0018. Production secrets live in AWS Parameter Store

- Status: accepted
- Date: 2026-11-21
- Supersedes: none

## Context

November kept secrets as SOPS-encrypted files in git, with two age keys to look after. The repos are public, so the encrypted values stay readable there for good.

## Decision

A production secret lives in AWS Parameter Store, encrypted, under `/<product>/<NAME>`. The deploy reads it on the host. Git holds only its name, in `.env.production.example`.

The owner sets each secret with a command that reads it without showing it, so no session ever sees a value. On the laptop, development values are generated into an untracked file. GitHub stores no cloud key: it signs in to AWS with short-lived credentials.

## Consequences

- It is free, for up to 10,000 values of 4 KB each.
- AWS encrypts each value, logs every read and every change, and keeps its history.
- Nothing secret is in git, not even encrypted.
- A secret is not reviewed in a pull request, and its history lives in AWS.
- A new value takes effect with the next deploy.

## Alternatives considered

- **SOPS-encrypted files in git.** Secrets would be versioned and reviewed with the code. The encrypted values would stay in public repos, and two keys would need care.
