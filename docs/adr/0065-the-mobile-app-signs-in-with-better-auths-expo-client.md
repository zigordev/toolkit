# 0065. The mobile app signs in with Better Auth's Expo client

- Status: accepted
- Date: 2026-11-27
- Supersedes: none

## Context

The template's mobile app, from [record 0045](0045-mobile-apps-are-built-with-expo-beside-the-web-app.md), needs sign-in before its notes screens. The API signs people in with Better Auth, through `@zigordev/auth` ([record 0050](0050-sign-in-carries-over-novembers-design.md)), and a session cookie. A phone app has no browser to keep that cookie, so the app has to keep the session itself, somewhere safe.

The API's half came first, in toolkit#176. `createAuth({ appSchemes })` trusts the origin `<scheme>://`, and a small plugin of our own, `app-origin`, reads that origin from the `expo-origin` header a phone sends. Better Auth's own server plugin was left out: pnpm linked its optional Expo libraries to `@zigordev/auth`, which would have put React Native into every API image.

On 2026-11-27 the owner was asked how the app should keep a person signed in, with three options: Better Auth's Expo client with `expo-secure-store`, our own small client with `expo-secure-store` alone, or tokens instead of cookies, through Better Auth's bearer plugin on the server. They chose, in their words: "A, Better Auth".

`@better-auth/expo` 1.7.28 and `expo-secure-store` 58.0.3 are both MIT-licensed and free, with no service behind them. Nothing is counted, and there is no paid step.

## Decision

- **Better Auth's client half.** The app builds its sign-in client with `createAuthClient` from `better-auth/react`, the `expoClient` plugin of `@better-auth/expo` and `twoFactorClient`, in `src/auth-client.native.ts`. `@better-auth/expo` stays out of `@zigordev/auth` and out of every API image.
- **The session in the phone's secure store.** The client keeps the session cookie in `expo-secure-store`: the Keychain on iOS, and storage encrypted by the Android Keystore on Android. It never goes to AsyncStorage or to a plain file. The store's plugin in `app.json` keeps it out of Android's backups, and asks for no Face ID permission, as the app does not use Face ID.
- **One name.** The scheme in `app.json` is the product's name, which is also the prefix of the API's cookies and of the keys in the store.
- **What the phone offers.** Sign-in with an email and a password, the two-factor step, the account and sign-out. The phone checks the fields with the web app's own rules, and names each problem in the web app's own words. Sign-up, Google, passkeys, turning on two-factor and deleting the account stay on the web for now. Each needs work of its own.
- **Ten seconds.** Every request of the sign-in client gives up after 10 seconds, like the app's other requests.

## Consequences

- A person stays signed in on the phone when the app restarts, for the session's 7 days, renewed once a day while they use the app.
- Sign-out forgets the session on the phone first, so it works even when the API cannot be reached.
- Sign-out on the phone also forgets "Trust this device", because the Expo client clears every cookie it keeps. The web app keeps that trust after a sign-out. On the phone, the trust spares the code only when a session ends by itself.
- There are two more libraries to keep current. Renovate moves `expo-secure-store` with the Expo SDK, and `@better-auth/expo` with Better Auth's releases, which publish every package at one version.
- Google on the phone needs `expo-web-browser` and the server's half of the hand-over from the browser, which `@zigordev/auth` does not have yet. Passkeys need a native library and links between the app and the product's domain.
- The app cannot delete an account yet. Before a product publishes it, check what each store asks of an app's account deletion.

## Alternatives considered

- **Our own small client, with `expo-secure-store` alone.** One library fewer and full control, but we would rebuild and maintain what Better Auth's client already does: the cookie store, the cached session, the refresh when the app comes back, and the two-factor step.
- **Tokens instead of cookies,** through Better Auth's bearer plugin on the server. No cookies on the phone, but it changes sign-in on the server for every product, and adds a second way of being signed in to secure and test.
- **AsyncStorage for the session.** Simpler, but not encrypted, and a session works like a password while it lasts.
