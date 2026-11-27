# @zigordev/ui-native

The design system's components for React Native: the Button, the form fields, the checkbox and the alert. They wear the design tokens of `@zigordev/tokens/native`, in light and in dark, so a product's mobile app looks like its web app.

## What it is

| Export                                 | What it is                                                                                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ThemeProvider`                        | Picks the tokens for the phone's light or dark setting, or a mode the app sets, and a product's colours. Every component needs it above                                         |
| `useTokens()`                          | The tokens of the nearest `ThemeProvider`, for a screen's own styles                                                                                                            |
| `Button`                               | A button in four variants (`solid`, `soft`, `outline`, `ghost`), three tones (`accent`, `neutral`, `danger`) and three sizes, with icons, an icon-only form and a loading state |
| `TextField`, `TextArea`                | A labelled input, with an optional description and an error, and the same with four lines                                                                                       |
| `Checkbox`                             | A labelled checkbox, with an optional description                                                                                                                               |
| `Alert`                                | A message in four tones (`info`, `success`, `warning`, `danger`), with an optional title                                                                                        |
| `buttonStyles` and the other `…Styles` | What each component looks like in each state, as a pure function from the tokens to React Native's style objects                                                                |
| `lineHeight`, `resolveMode`            | Turn a line-height ratio of the tokens into whole pixels, and pick light or dark from a mode and the phone's setting                                                            |

## Why we have it

`@zigordev/ui` draws the web's components with Base UI and CSS, which React Native cannot use. A mobile app still needs the same buttons and fields, in the same colours, and each product would otherwise draw its own. [Record 0062](../../docs/adr/0062-native-components-ship-as-their-own-package.md) holds why this is a package of its own.

## How it works here

- **The tokens.** `ThemeProvider` reads `nativeTheme` from `@zigordev/tokens/native`: every token as a value React Native takes, with colours as `#rrggbb` and sizes as numbers. A press uses the tokens the web uses for a hover.
- **Logic apart from the view.** Each component's look is a pure function, such as `buttonStyles(tokens, look)`, which Vitest tests with the real tokens. The component itself, in a file named `*.native.tsx`, only lays out React Native's views and passes them those styles.
- **Coverage.** `pnpm check` leaves `*.native.tsx` out of coverage, as it leaves `*.client.tsx` out. The template's mobile app runs the components on the simulator and the emulator, and Maestro will test its screens.
- **Accessibility.** Each component gives the screen reader its role and state: a button, a busy or disabled button, a checkbox that is checked, an alert.
- **The font.** The phones show the system font for now. Loading the font that the tokens name comes with a later part.

## How to use it

```tsx
import { Alert, Button, TextField, ThemeProvider } from '@zigordev/ui-native';

export default function SignIn() {
  return (
    <ThemeProvider>
      <TextField label="Email" keyboardType="email-address" autoComplete="email" />
      <Alert tone="danger">Sign-in did not work. Try again.</Alert>
      <Button onPress={signIn}>Sign in</Button>
    </ThemeProvider>
  );
}
```

`ThemeProvider` takes `mode` (`light`, `dark` or `system`, the default) and `product`, for a product's own colours.

## How to check that it works

- `pnpm exec vitest run --project ui-native` tests every component's look, in each variant, tone, size and state.
- `pnpm --dir template/apps/template-mobile run ios`, or `run android`, shows the components in the template's app. When the API cannot be reached, its start screen shows the danger alert and a soft button.
- When a component shows the wrong colours, check that `ThemeProvider` sits above it, and which mode the phone is in.
