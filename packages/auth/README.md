# @zigordev/auth

Sign-in for zigordev apps, built on [Better Auth](https://www.better-auth.com).

## What it is

One package that gives an app every way to sign in that [record 0020](../../docs/adr/0020-sign-in-with-email-passkeys-and-google.md) asks for: email with a password, passkeys, optional two-factor and Google, plus sessions and account deletion. [Record 0050](../../docs/adr/0050-sign-in-carries-over-novembers-design.md) holds every setting. Each app keeps its own users, sessions and accounts in its own PostgreSQL database, and apps share no login.

| Entry                    | Holds                                                                           |
| ------------------------ | ------------------------------------------------------------------------------- |
| `@zigordev/auth`         | `createAuth`, `authConfigShape`, the email and session types                    |
| `@zigordev/auth/drizzle` | the tables Better Auth writes, for the app's Drizzle schema                     |
| `@zigordev/auth/fastify` | `serveAuth`, which serves `/api/auth/*`, and `authenticateWith` for `createApi` |
| `@zigordev/auth/next`    | the route handler for `/api/auth/*`, `getUser()` and `requireUser()`            |
| `@zigordev/auth/client`  | Better Auth's React client on `/api/auth`, with passkeys and two-factor         |
| `@zigordev/auth/testing` | a local Google for tests, an authenticator app and a passkey in memory          |

## Why we have it

Sign-in is easy to get subtly wrong: sessions that outlive a sign-out, a reset link that works twice, an answer that tells a stranger whether an address has an account. One maintained library behind one tested setup gives every app the same safe behaviour from one version. Without it, each app would build and test sign-in again, and each would get different parts of it wrong.

## How it works here

Better Auth runs in the app that owns the users table:

- **A product with an API**, such as `gpool-api` and `gpool-web`: the Fastify API runs it. The web app forwards `/api/auth/*` to the API on its own origin, and its `getUser()` asks the API for the session.
- **A Next.js app with its own database and no API**: Next.js runs it in its route handler and reads sessions in process.

Either way the browser only talks to the app's own origin, so the cookies stay host-only and no CORS is needed.

| Setting                     | Value                                                                                                                                                                                                                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sessions                    | rows in `sessions`, 7 days, renewed for 7 more when used after a day. No cookie cache, so sign-out and revocation apply at once                                                                                                                                                                     |
| Fresh session               | a sensitive action needs a session under a day old                                                                                                                                                                                                                                                  |
| Cookies                     | host-only, `HttpOnly`, `SameSite=Lax`, `Path=/`, and on https `Secure` with the `__Secure-` prefix, named after the app                                                                                                                                                                             |
| Passwords                   | 15 to 128 characters, with no composition rules, hashed with scrypt                                                                                                                                                                                                                                 |
| Email verification          | needed before a password sign-in. The link lasts an hour and signs the user in                                                                                                                                                                                                                      |
| Password reset              | the link lasts an hour and is stored hashed, and a reset ends every session                                                                                                                                                                                                                         |
| Existing email              | a sign-up with an address that has an account gets the same answer as a new one, and the owner of the address gets an email                                                                                                                                                                         |
| Account linking             | Google joins a password account only when that account's email is verified, and a password reset adds a password to a Google account                                                                                                                                                                |
| OAuth tokens                | encrypted at rest                                                                                                                                                                                                                                                                                   |
| Rate limits                 | per client address and route, in `rate_limits`: 3 per 10 seconds on sign-in and sign-up, 3 per minute on reset and verification emails, 100 per 10 seconds elsewhere. Reading the session is never limited                                                                                          |
| Cross-site checks           | a request that carries cookies has to come from `AUTH_URL`, and every callback address has to stay on it                                                                                                                                                                                            |
| Passkeys                    | with `passkey` among the methods, a user signed in within the last day adds and names passkeys that need a fingerprint, face or PIN, bound to the app's domain, and then signs in with one. Accounts still start with Google or email                                                               |
| Two-factor                  | each password user can turn on codes from an authenticator app, with 10 one-time backup codes. A trusted device skips the code for 30 days, and 10 wrong codes lock the account for 15 minutes. Google and passkey sign-ins are not asked for a code. Secrets and backup codes are stored encrypted |
| Account deletion            | a signed-in user asks, gets a one-hour link by email, and opening it while signed in deletes the account at once and for good, with its sessions, linked accounts, passkeys and two-factor data                                                                                                     |
| Better Auth's own telemetry | off                                                                                                                                                                                                                                                                                                 |

The client address comes from `X-Forwarded-For`, which the platform's Traefik sets and the web app's forwarding handler passes on unchanged.

### Emails

The package never renders or delivers mail. It calls the app's `sendEmail` with one of four messages, in the background, so an answer neither waits for delivery nor tells whether an address has an account:

| `kind`           | Sent when                                                    | Carries                      |
| ---------------- | ------------------------------------------------------------ | ---------------------------- |
| `verify-email`   | someone signs up, or signs in before verifying               | `url`, the verification link |
| `reset-password` | someone asks for a reset                                     | `url`, the reset link        |
| `account-exists` | someone signs up with an address that already has an account | no link                      |
| `delete-account` | a signed-in user asks to delete their account                | `url`, the confirmation link |

Every message has `to`, `name`, `idempotencyKey` and the `request`, whose headers give the language. The key comes from the link's token, or from the user and a 10-minute window for `account-exists`, so a retry never sends twice. The app renders the message with [`@zigordev/email`](../email/README.md) and sends it to the notifications service as a request event, as [record 0042](../../docs/adr/0042-notifications-takes-requests-and-gives-outcomes-over-kafka.md) says. A sender that throws is logged as `auth.email_failed` and counted, and closing the app waits for emails still being sent.

### What it reports

| Event                                        | Level       | When                                                                  |
| -------------------------------------------- | ----------- | --------------------------------------------------------------------- |
| `auth.signed_up`                             | info        | an account is created, with `method` and `userId`                     |
| `auth.signed_in`                             | info        | a user signs in, after any second factor, with `method` and `userId`  |
| `auth.sign_in_failed`                        | warn        | a sign-in or its second factor is refused, with `method` and `reason` |
| `auth.signed_out`                            | info        | a user signs out                                                      |
| `auth.email_verified`                        | info        | a user confirms their email                                           |
| `auth.password_reset`                        | info        | a user sets a new password from a reset link                          |
| `auth.account_linked`                        | info        | a second method joins an account                                      |
| `auth.passkey_added`, `auth.passkey_removed` | info        | a user adds or removes a passkey                                      |
| `auth.two_factor_enabled`                    | info        | a user finishes turning on two-factor                                 |
| `auth.two_factor_disabled`                   | info        | a user turns two-factor off                                           |
| `auth.account_deleted`                       | info        | a user confirmed, and the account is gone                             |
| `auth.account_deletion_failed`               | error       | `deleteUserData` threw, so the account stays                          |
| `auth.email_failed`                          | error       | `sendEmail` threw, with `kind`                                        |
| `auth.rate_limited`                          | warn        | a request got 429, with its route                                     |
| `auth.api_unreachable`                       | error       | the web app could not reach the API                                   |
| `auth.google_stand_in_enabled`               | warn        | at start, when Google points at a stand-in                            |
| `auth.library_error`, `auth.library_warning` | error, warn | Better Auth's own messages, with addresses masked                     |

Events carry the user's id, a random UUID, and never an email, a name, an IP address or a user agent. The counters `auth.user.sign_ins` (`method`, `outcome`), `auth.user.sign_ups` (`method`) and `auth.email.sends` (`kind`, `outcome`) start at zero for every method the app turns on, and `auth.user.deletions` when deletion is on.

## How to use it

Add the package and its peers:

```bash
pnpm add @zigordev/auth @zigordev/otel @opentelemetry/api drizzle-orm pg zod
```

`drizzle-orm`, `zod`, `@zigordev/otel` and `@opentelemetry/api` are peers, so the app keeps one copy of each. `@zigordev/api`, `fastify`, `next` and `react` are optional peers, needed only by the entry that uses them.

Add the settings to the app's config schema, from [`@zigordev/config`](../config/README.md):

```ts
import { type AuthMethod, authConfigShape } from '@zigordev/auth';

export const authMethods: readonly AuthMethod[] = ['email', 'google', 'passkey'];

const schema = z.object({
  ...service,
  DATABASE_URL: z.url(),
  ...authConfigShape(authMethods),
});
```

| Variable                    | Holds                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`               | at least 32 random characters, which sign cookies and tokens and encrypt OAuth tokens                   |
| `AUTH_URL`                  | the origin browsers use, such as `https://gpool.zigordev.com`, or `http://localhost:3001` on the laptop |
| `AUTH_GOOGLE_CLIENT_ID`     | the Google OAuth client's id, needed when `google` is a method                                          |
| `AUTH_GOOGLE_CLIENT_SECRET` | its secret, needed when `google` is a method                                                            |
| `AUTH_GOOGLE_STAND_IN_URL`  | the origin of a Google stand-in, only in tests                                                          |

`openssl rand -base64 48` makes a secret. In production `AUTH_SECRET` and the two Google values are secrets in AWS Parameter Store, which the owner stores, as every secret. On the laptop they live in an untracked env file of the app, never in git.

Re-export the tables from the app's schema file, so that drizzle-kit writes them into the app's own migrations, as the [`add-migration` skill](../../.claude/skills/add-migration/SKILL.md) does for any table:

```ts
export * from '@zigordev/auth/drizzle';
```

They follow the data rules: `users`, `sessions`, `accounts`, `passkeys`, `two_factors`, `verifications` and `rate_limits`, `uuid` keys that default to `uuidv7()`, `timestamptz` columns with `created_at` and `updated_at` on every table, and the user's sessions, accounts, passkeys and two-factor data deleted with the user. The app's own data about a user lives in its own tables, keyed by `user_id`. When a release of this package changes a table, the app generates a new migration.

The worked example is an API that signs people in and answers who they are:

```ts
import { createAuth } from '@zigordev/auth';
import { authenticateWith, serveAuth, userOf } from '@zigordev/auth/fastify';
import { createApi } from '@zigordev/api';

const auth = createAuth({
  appName: 'gpool',
  displayName: 'GPool',
  config,
  methods: authMethods,
  db,
  logger,
  sendEmail,
  deleteUserData: (userId) => pools.removeEverythingOf(userId),
});

const app = await createApi({
  service: 'gpool-api',
  logger,
  docs,
  authenticate: authenticateWith(auth),
});
await serveAuth(app, auth);

app.get('/api/v1/me', async (request) => {
  const user = userOf(request);
  return { id: user.id, name: user.name };
});
```

- `appName` names the cookies: `__Secure-gpool.session_token` on https, `gpool.session_token` on http.
- `displayName` is the name a device shows when it saves a passkey, and the issuer an authenticator app shows.
- `deleteUserData` removes what the app keeps about a user before the account goes. If it throws, the account stays. `accountDeletion: false` turns deletion off, and `twoFactor: false` turns two-factor off.
- `serveAuth` serves Better Auth's endpoints under `/api/auth/*` as public routes, hidden from the API's documentation. They keep Better Auth's paths and its `{ code, message }` errors, because Better Auth's client depends on them.
- `authenticateWith(auth)` makes every other route need a session, as `createApi` does for any sign-in. It puts the user on the request, renews the session cookie when it is due, and answers the standard 401 problem when nobody is signed in. `userOf(request)` returns the user.

The web app makes `lib/auth.ts`, lazily, so that a build never needs the settings:

```ts
import { createNextAuth, type NextAuth } from '@zigordev/auth/next';

let nextAuth: NextAuth | undefined;

export function getNextAuth(): NextAuth {
  nextAuth ??= createNextAuth({ apiUrl: config.API_URL, signInPath: '/sign-in', logger });
  return nextAuth;
}
```

- `app/api/auth/[...all]/route.ts` exports `GET` and `POST` from `getNextAuth().handlers`. With an API it forwards each request, body, cookies and redirects included, and answers 502 while the API is down. Pass `{ auth }` in place of `{ apiUrl }` when Next.js runs Better Auth itself.
- `getUser()` and `getSession()` read the session once per request in server components, and never renew it.
- `requireUser('/account')` returns the user, or sends the browser to `/sign-in?next=%2Faccount`. The sign-in page accepts only local paths in `next`.

In the browser, `createAuthClient()` from `@zigordev/auth/client` signs in with `signIn.email`, `signIn.social({ provider: 'google' })` and `signIn.passkey({ autoFill: true })`. Its `useSession()` renews the session while the user is active. `passkey.addPasskey({ name })` adds a passkey from the account page, `twoFactor.enable({ password })` gives the authenticator address for a QR code and the 10 backup codes, `twoFactor.verifyTotp({ code, trustDevice })` checks a code, and `deleteUser()` sends the deletion link.

### Google

A product with real users gets its own Google Cloud project, because Google shows the project's name on its screen. On this Mac the template signs in with the `zigordev` project's client `template on this Mac`, whose return addresses are `http://localhost:3001/api/auth/callback/google` and `http://127.0.0.1:3001/api/auth/callback/google`: Google accepts plain http only for `localhost`. A product that goes live adds `https://<product>.zigordev.com/api/auth/callback/google` to its client.

## How to check that it works

`pnpm exec vitest run --project auth --project auth:db` in `toolkit` runs this package's tests. The second project needs Docker, and runs every sign-in path against a real PostgreSQL: sign-up and verification, sessions and their renewal, Google through a stand-in, passkeys, two-factor, password reset, deletion and the rate limits.

In tests, `startGoogleStandIn()` from `@zigordev/auth/testing` starts a local Google that checks the client, the return address and PKCE, and signs an ID token as Google does. Run the app with `AUTH_GOOGLE_CLIENT_ID`, `AUTH_GOOGLE_CLIENT_SECRET` and `AUTH_GOOGLE_STAND_IN_URL` from it, and Better Auth's real Google provider sends the browser to the stand-in. `totpCode(totpURI)` gives the current code of an authenticator app, and `createSoftwarePasskey()` is a passkey in memory, with a real key that Better Auth verifies.

| What you see                                                       | What it means, and what to do                                                                                                            |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Every route answers 401, also right after a sign-in                | The browser does not send the cookie back. Check that `AUTH_URL` is the origin in the browser's address bar, with the same host and port |
| 403 with `INVALID_ORIGIN` on a sign-in                             | The request came from an origin other than `AUTH_URL`. Open the app at `AUTH_URL`                                                        |
| Google says `redirect_uri_mismatch`                                | The client lacks this return address. Add `<AUTH_URL>/api/auth/callback/google` to the client in Google's console                        |
| No verification email arrives, and the log has `auth.email_failed` | The app's `sendEmail` threw. Its error is in the same log line                                                                           |
| 429 on a sign-in                                                   | The rate limit for that address and route. It clears after its window                                                                    |
| A sign-in fails with a server error that names a table or a column | The app's migrations lag behind this package. Generate a migration from the re-exported tables and run it                                |
