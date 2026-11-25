# 0050. Sign-in carries over November's design, with emails as events

- Status: accepted
- Date: 2026-11-25
- Supersedes: none

## Context

[Record 0020](0020-sign-in-with-email-passkeys-and-google.md) says what sign-in offers: email with a password, passkeys, optional two-factor and Google, each product with its own users, and the verification email through the notifications service. It leaves the details open.

In November, toolkit built `@zigordev/auth` 0.2.1 on Better Auth with every detail settled and tested, and the owner agreed each one on 2026-11-19 and 2026-11-20, in November's records 0033 and 0034, now kept in `legacy-projects/`. Since then, [record 0042](0042-notifications-takes-requests-and-gives-outcomes-over-kafka.md) sends email requests as events over Kafka, `@zigordev/api` checks every request's sign-in through one `authenticate` function, and the template's web app runs on port 3001 on the laptop.

Facts read on npm on 2026-11-25: `better-auth` and `@better-auth/passkey` 1.7.28 came out on 2026-11-24 under MIT, and 1.7.27 on 2026-11-20. November used 1.7.26.

## Decision

`@zigordev/auth` is November's package, carried over and fitted to today's toolkit:

- **Where it runs:** the app that owns the users table runs Better Auth. In a product with a Fastify API, the API serves `/api/auth/*` as public routes and gives `createApi` its `authenticate`, and the web app forwards `/api/auth/*` on its own origin. A Next.js app with no API runs it in a route handler.
- **Sessions:** rows in the app's database, kept 7 days and renewed after a day of use. A sensitive action needs a session under a day old. No cookie cache, so sign-out and revocation apply at once, and a password reset ends every session.
- **Cookies:** host-only, `HttpOnly`, `SameSite=Lax`, and on https `Secure` with the `__Secure-` prefix, named after the app.
- **Tables:** Drizzle definitions in the shape of the data rules, which apps re-export, so drizzle-kit writes their migrations. Better Auth's own CLI is not used.
- **Email:** the app passes one `sendEmail` for `verify-email`, `reset-password`, `account-exists` and `delete-account`. It renders the message with `@zigordev/email` and sends it as a request event to the notifications service. Links last an hour and are stored hashed.
- **Passwords:** 15 to 128 characters, with no composition rules, as NIST SP 800-63B-4 asks. Password sign-in waits for a verified email, and Google joins only a verified account.
- **Rate limit:** Better Auth's own, on everywhere and stored in the database. Reading the session is exempt.
- **Two-factor:** opt-in codes from an authenticator app with 10 backup codes, a device trusted for 30 days, a 15-minute lock after 10 wrong codes, for password sign-ins only, and no codes by email.
- **Passkeys:** added by a signed-in user and then used to sign in, browser autofill included. No passkey-only sign-up. The relying party is the app's own domain.
- **Deletion:** a one-hour emailed link, opened while signed in, deletes the account at once and for good, with the app's own data through `deleteUserData`.
- **Telemetry:** events and metrics carry the method and the outcome, and logs the user's random id, never an email, a name, an address or a user agent.
- **Google:** tested against a stand-in in CI, and against the real Google on the laptop at `http://localhost:3001/api/auth/callback/google`. A product with real users gets its own Google Cloud project, so its own name shows on Google's screen.
- **No users move** from the legacy apps.
- **Version:** Better Auth 1.7.27, the newest past its day of waiting, and then Renovate's updates.

## Consequences

- Step 6.3 is mostly a port of tested code. November's tests run unchanged in their checks.
- A person who uses two products has two accounts.
- Each signed-in request reads its session from the database: one indexed query.
- The auth routes are not in an app's `openapi.json`. Apps call them through Better Auth's client.
- In a product with an API, the web app's sign-in depends on the API, and answers 502 while it is down.
- Each product needs its own Google client, and the notifications service to send its emails.

## Alternatives considered

- **Decide each detail again.** A fresh look at every point, but about a dozen decisions before any code, for choices the owner made on 2026-11-19 and 2026-11-20.
- **No passwords at all.** Passkeys, and a one-time code by email for a device without one. Record 0020 already turned it down.
- **One identity service for every product.** The owner ruled it out on 2026-11-19, because the products serve different publics.

The owner accepted this record on 2026-11-25, in their words: "Accept 0050 (Recommended)".
