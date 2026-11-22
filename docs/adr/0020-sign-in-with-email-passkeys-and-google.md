# 0020. Sign-in offers email, passkeys, two-factor and Google

- Status: accepted
- Date: 2026-11-21
- Supersedes: none

## Context

November built sign-in on Better Auth, with email and a password, passkeys and optional two-factor. All 64 existing users of gpool signed in with Google, so Google has to return with gpool in any case.

## Decision

`@zigordev/auth` offers email with a password, passkeys, optional two-factor and Google, from the start. Each product keeps its users and its sessions in its own database, and there is no shared login. The verification email goes through the notifications service.

In CI, sign-in with Google runs against a stand-in. Against the real Google it is tried on the laptop.

## Consequences

- The owner creates a new Google OAuth client before the step that builds sign-in.
- Every sign-in path has a test.
- Each product with users has account deletion and a short privacy note.

## Alternatives considered

- **The same, with Google only when gpool returns.** No outside account would be needed until then.
- **No passwords at all.** Passkeys, and a one-time code by email for a device without one.
