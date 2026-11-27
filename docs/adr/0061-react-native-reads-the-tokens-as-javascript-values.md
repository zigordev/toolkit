# 0061. React Native reads the tokens as JavaScript values

- Status: accepted
- Date: 2026-11-27
- Supersedes: none

## Context

On 2026-11-27 the owner chose that the mobile app's native components ship as a package of their own, `@zigordev/ui-native`. React Native draws with the phone's own views. It reads no CSS variables, no `oklch()`, no `color-mix()` and no `rem`. The tokens existed only as `tokens.css`, so the native components had no way to wear the same colours, sizes and type as the web.

## Decision

- `@zigordev/tokens` gets a second entry, `@zigordev/tokens/native`, with every token resolved to its final value for the template's colours and each product's, in light and in dark.
- Colours are `#rrggbb`, or `rgba()` when see-through. Lengths are numbers in pixels, at 16 pixels a rem. Durations are milliseconds, font weights the strings React Native takes, easings the four numbers of a cubic Bézier curve, and a font family the first one a phone can load.
- The names are the CSS variables' without `--ds-`, such as `color-accent-solid`. A generated interface, `NativeTokens`, lists them all.
- `pnpm --dir packages/tokens run generate` writes the values to `src/generated/native.ts` from `dist/tokens.css`, the same build the web reads. A test fails while the committed file differs, as `@zigordev/email` does for its theme.
- The palettes behind the colour scales stay out. Components use the roles.

## Consequences

- A token changes in one place, and the web and the phone change together, with one release.
- A renamed or removed token fails the type check of the native components.
- The package carries about 80 KB of generated values, for four colour sets in two modes. A web app never imports them.
- A new kind of value in `tokens.css` fails the generator until it learns how React Native takes it, so nothing reaches the phone unconverted.

## Alternatives considered

- **Terrazzo's JavaScript plugin**: one more dependency. It would still need our conversion to hex and pixels, and our resolution of products and modes.
- **Values written by hand in `@zigordev/ui-native`**: no build step, but a second copy of every token that drifts from the first.
- **Reading the CSS at run time on the phone**: React Native has no CSS engine, and a parser would ship to every phone for no gain.
