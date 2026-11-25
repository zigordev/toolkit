# 0045. Mobile apps are built with Expo, beside the web app

- Status: proposed
- Date: 2026-11-25
- Supersedes: none

## Context

On 2026-11-24 the owner asked to evaluate native mobile apps as an option of the template, in their words "as some of the apps might need a native mobile app in parallel at some point". The plan already named an Expo app as one more client of a product's API, for when a product needs it. No legacy code has a mobile app, and this Mac has no full Xcode, which iOS builds need.

The owner took eight decisions on 2026-11-24, one at a time. In their words:

1. How mobile apps are built: "A: Expo".
2. When it enters the template: "A: in phase 6".
3. Where builds run: "A: GitHub, native tools".
4. How updates reach installed apps: "A: store releases only".
5. The push path: "A", straight to Apple's and Google's push services.
6. The end-to-end test tool: "A", Maestro.
7. The unit-test runner: "C: Vitest only".
8. When the store accounts open: "A: at first publish".

Facts checked on 2026-11-25:

- Expo SDK 58 is the latest. It runs React Native 0.88 and React 19.3, the React of the web app. `expo` 58.0.26 and `react-native` 0.88.1 are under MIT, and Maestro, cli-2.12.1 of 2026-11-02, is under Apache-2.0.
- GitHub's standard runners are free in public repos. In a private repo a macOS minute costs $0.062.
- Apple's Developer Program costs $99 a year, and an individual's legal name is shown as the seller. Google Play costs US$25 once. A personal Google account created after 2023-11-13 must run a closed test with at least 12 testers for 14 days before it may publish.
- Firebase Cloud Messaging, Google's push service, costs nothing on both Firebase plans.

## Decision

- A product may add a mobile app, `apps/<product>-mobile`, built with Expo beside its web app. It is opt-in, and the template holds `template-mobile`.
- The app is one more client of the product's API. It shares the generated API client, the Zod schemas, the design tokens, the translated messages and sign-in with the web app.
- Builds run on GitHub's runners with Apple's and Google's own tools, after `npx expo prebuild` writes the native projects. No Expo account or token is involved. Signing keys arrive as GitHub secrets, set by the owner, when a product publishes.
- Every change ships as a store release. Feature flags switch features on and off without a release, and the API can tell an outdated app to update.
- The notifications service sends push messages straight to Apple's APNs and Google's FCM, with each phone's own token. Their keys live in Parameter Store, set by the owner. Each product keeps its users' device tokens, sends them with each push request over Kafka, and drops a token when the outcome says it failed.
- Maestro tests the screens end to end: iOS on GitHub's macOS runners, Android on emulators on its Linux runners. Vitest tests the logic, which lives in plain TypeScript and React code outside the screens. Jest comes only by a decision of its own.
- The owner opens the Apple and Google accounts when the first product is ready to publish an app, and chooses then between an individual and a company account.
- The template's slice is a new step right after the live-updates step, before the journeys. It proves simulators, emulators and push on Android. The path through APNs is proven with the first iPhone product.

## Consequences

- A product reaches phones with one language and one set of shared packages.
- Builds cost nothing while the repos are public, and depend on no Expo service. We set up and keep the native tools on GitHub's runners ourselves.
- Before the step, the owner installs Xcode on this Mac, creates a free Firebase project for Android push, and sets its key as a secret.
- At first publish the owner pays $99 a year to Apple and US$25 once to Google, and plans at least three weeks for Google's closed test and review.
- Every fix to an installed app waits for a store review.
- Expo, React Native and Maestro get their rows in the handbook's tools page in the step that brings them.

## Alternatives considered

- **Capacitor**, the web app inside a native shell. It needs a static export of Next.js, which drops server features such as Route Handlers and Server Actions.
- **An installable web app only.** Nothing to publish, and no place in the stores. It can still come in addition, for apps that only need the home screen.
- **Native Swift and Kotlin, or Flutter.** Two codebases, or the Dart language, with nothing shared with the web app.
- **Expo's own build servers.** The Free plan gives up to 15 Android and 15 iOS builds a month in a low-priority queue, and Starter costs $19 a month plus usage. It needs an Expo account, and keeps signing keys on Expo's servers by default.
- **Expo's update service, or one of our own.** Fixes without review, within the stores' rules. Expo's is free up to 1,000 monthly users.
- **Expo's push service.** Free, but every push message would depend on Expo.
- **Detox or Appium for the end-to-end tests, and Jest for unit tests.** Detox and Appium tests are code instead of Maestro's short flows, and Jest would be a second test runner beside Vitest.
