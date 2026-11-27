# 0062. Native components ship as their own package

- Status: accepted
- Date: 2026-11-27
- Supersedes: none

## Context

The template's mobile app, from [record 0045](0045-mobile-apps-are-built-with-expo-beside-the-web-app.md), needs buttons, fields, a checkbox and alerts for its sign-in and notes screens. `@zigordev/ui` draws them for the web with Base UI and CSS, which React Native cannot use. [Record 0061](0061-react-native-reads-the-tokens-as-javascript-values.md) gave React Native the design tokens as JavaScript values, through `@zigordev/tokens/native`.

On 2026-11-27 the owner was asked where the native components should live, with three options: a new package beside `@zigordev/ui`, inside the template's app, or a third-party native UI kit themed with our tokens. They chose, in their words: "A".

Vitest cannot draw React Native components, and [record 0045](0045-mobile-apps-are-built-with-expo-beside-the-web-app.md) keeps Jest out until a decision of its own.

## Decision

- **One package.** `@zigordev/ui-native` holds the native components. They mirror the web's names and choices: `Button` with the same variants, tones and sizes, `TextField`, `TextArea`, `Checkbox` and `Alert`. Their colours, sizes and type come from `@zigordev/tokens/native`, and `ThemeProvider` follows the phone's light or dark setting.
- **Logic apart from the view.** What a component looks like in each state is a pure function from the tokens to React Native's style objects, such as `buttonStyles`. Vitest tests those functions with the real tokens.
- **The `.native` name.** A module that only runs on a phone is named `*.native.tsx`. `pnpm check` leaves it out of coverage, as it leaves out `*.client.tsx`. The app's screens run it on the simulator and the emulator, and Maestro will test those screens.
- **Private first.** The package starts with `"private": true`, until the owner's first publish.

## Consequences

- Every product's app gets the same components, drawn from the same tokens as its web app, and a change reaches all of them with a release.
- The web and the native components are two implementations of one design, so a change to a component is made in both packages.
- Until Maestro's screen tests arrive, a native component is seen only through the app's screens, on the simulator and the emulator.
- The phones show the system font until a later part loads the font that the tokens name.

## Alternatives considered

- **Inside the template's app.** The least setup, but each product copies the components, and the copies drift apart.
- **A third-party native UI kit themed with our tokens,** such as Tamagui or React Native Paper. More components from day one, but a new tool with its own look and its own idea of theming, and a licence and price to check.
