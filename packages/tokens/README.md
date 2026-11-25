# @zigordev/tokens

The design tokens of every zigordev app: the colours, the type, the spacing, the corners and the motion of one brand, built into CSS custom properties. Dark is the default, and light is the other mode.

The package is private until the owner publishes it for the first time.

## What it is

A design token is one named design value, such as `--ds-color-accent-solid` or `--ds-radius-button`. A component and an app's own CSS use the name, never the value, so the value can change in one place.

| Export            | What it is                                                                      |
| ----------------- | ------------------------------------------------------------------------------- |
| `tokens.css`      | Every token as a CSS custom property, in the layer `ds.tokens`                  |
| `modes`           | `['light', 'dark']`                                                             |
| `defaultTheme`    | `{ mode: 'dark' }`                                                              |
| `themeAttributes` | `{ mode: 'data-mode' }`, the attribute on the page's root that chooses the mode |

[`@zigordev/ui`](../ui/README.md) bundles `tokens.css` into its own stylesheet, so an app that loads `@zigordev/ui/ui.css` has every token.

## Why we have it

Every app of the platform wears one brand, the owner's decision of 2026-11-20: an anthracite base, a lavender accent, the precise corners of 4 px on buttons and fields and 6 px on cards, and Mona Sans as the typeface. [Record 0022](../../docs/adr/0022-design-system-starts-small-with-storybook.md) starts the design system with those colours and the Button. Without the tokens, each app would copy the values, and the copies would drift.

## How it works here

The source is a set of JSON files in the format of the W3C's design tokens group, under `src/tokens`:

| Folder  | What it holds                                                                                                                                            |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `base`  | The tokens that do not change with the mode: type, spacing, corners, motion, layout, control sizes and the colour roles                                  |
| `color` | The colour ramps of the brand and of the four states, each with a light and a dark half, as November's design system worked them out to contrast targets |
| `mode`  | The surfaces and the elevation of each mode                                                                                                              |

`resolver.json` says which files form the base and which belong to each mode. Terrazzo builds them into `dist/tokens.css`:

- the dark mode at `:root`, so a page with no attribute is dark;
- the light mode at `:root[data-mode="light"]`;
- the light mode at `:root[data-mode="system"]` when the system prefers light.

Only the tokens that a mode owns are written again for light, so a radius or a font is set once. A colour role, such as `--ds-color-accent-solid`, points at a step of a ramp, and the mode decides which half of the ramp that step reads. Components use roles, never the ramps themselves.

## How to use it

An app loads the stylesheet of `@zigordev/ui`, which holds the tokens, and writes its own CSS Modules with token names only:

```css
.card {
  padding: var(--ds-space-4);
  border-radius: var(--ds-radius-card);
  background-color: var(--ds-color-bg-raised);
  color: var(--ds-color-fg-default);
}
```

To follow the system's choice of light or dark, the app sets the attribute on the root:

```tsx
import { themeAttributes } from '@zigordev/tokens';

<html lang="en" {...{ [themeAttributes.mode]: 'system' }}>
```

## How to check that it works

- `pnpm exec vitest run --project tokens` in `toolkit` builds nothing and reads `dist/tokens.css`, so build first with `pnpm --dir packages/tokens run build`. The tests check that dark is the default, that light and the system's light change the colours and nothing else, and that the brand's accent, corners and typeface are in place.
- A colour that looks wrong in one mode usually points at the wrong half of a ramp in `mode/` or `color/`. Storybook shows both modes side by side: `pnpm --dir packages/ui run storybook`.
