# 0059. The mobile app keeps the React version of its Expo SDK

- Status: proposed
- Date: 2026-11-27
- Supersedes: none

## Context

[Record 0045](0045-mobile-apps-are-built-with-expo-beside-the-web-app.md) puts an Expo app beside the web app in the template. Its first part, `template/apps/template-mobile`, was built on 2026-11-27.

React Native carries its own copy of React's renderer, and refuses to start with any other React version than the one that copy was built from. Expo names that version for each SDK: on 2026-11-27, Expo SDK 58.0.26, the newest release older than a day, named React and React DOM 19.3.0, with React Native 0.88.1.

The workspace keeps one exact version of each dependency, and its default catalog holds React 19.3.1, which the web app and the design system run. [Record 0036](0036-the-client-generator-runs-on-its-own-typescript-5.md) made the one exception so far: a catalog of its own, held to one package, for a tool that cannot run the shared version.

## Decision

One version per dependency gets a second exception, held to the mobile app:

- A named catalog of `pnpm-workspace.yaml`, `mobile`, holds `react` and `react-dom` at the versions the Expo SDK in use names. Only the mobile app takes them from it. Everything else stays on the default catalog.
- Renovate leaves that catalog alone, and moves Expo's libraries and React Native together, as one group.
- The catalog moves only with an Expo SDK upgrade, made by hand. `expo install --check` says which versions the SDK wants.
- The exception goes when the Expo SDK in use names the same React version as the default catalog. The catalog and its Renovate rule are then removed in the same pull request.

## Consequences

- The mobile app starts on the simulator and the emulator, and the web app keeps every React release.
- The lockfile holds two versions of React. A shared package that takes React as a peer, such as TanStack Query, resolves each app's own.
- A future shared package for the mobile app, such as native components, must accept both versions in its peer range.
- A product copied from the template carries the same catalog and the same rule.

## Alternatives considered

- **Hold the whole workspace at the React version Expo names.** One catalog, but the web app and the design system would wait for each Expo SDK to take a React fix, and Renovate would need a rule to hold React everywhere.
- **Run the mobile app on React 19.3.1 anyway.** React Native refuses to start with a React version its renderer was not built from, so this does not work.
- **Keep the mobile app in a repo of its own.** No shared catalog, but record 0045 puts the app in the template, beside the web app, to share the API client, the texts and sign-in.
