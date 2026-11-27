# @zigordev/tokens

The design tokens of every zigordev app: the colours, the type, the spacing, the corners and the motion, built into CSS custom properties. Every app shares them, and each product wears its own colours. Dark is the default, and light is the other mode.

## What it is

A design token is one named design value, such as `--ds-color-accent-solid` or `--ds-radius-button`. A component and an app's own CSS use the name, never the value, so the value can change in one place.

| Export            | What it is                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `tokens.css`      | Every token as a CSS custom property, in the layer `ds.tokens`                                                           |
| `modes`           | `['light', 'dark']`                                                                                                      |
| `products`        | `['gpool', 'trading-bot', 'cv']`, the products that wear their own colours                                               |
| `defaultTheme`    | `{ mode: 'dark' }`: dark, in the template's colours                                                                      |
| `themeAttributes` | `{ mode: 'data-mode', product: 'data-product' }`, the attributes on the page's root that choose the mode and the colours |

[`@zigordev/ui`](../ui/README.md) bundles `tokens.css` into its own stylesheet, so an app that loads `@zigordev/ui/ui.css` has every token.

## Why we have it

Every app shares one set of components, with the same type, spacing and corners: 4 px on buttons and fields, 6 px on cards, and Mona Sans as the typeface. Each product has its own colours, the owner's decision of 2026-11-27 in [record 0058](../../docs/adr/0058-each-product-wears-its-own-colours.md):

| Product                  | Background                    | Accent   |
| ------------------------ | ----------------------------- | -------- |
| The template, by default | Anthracite, a blue-grey slate | Lavender |
| gpool                    | Pine, a dark green-grey       | Mint     |
| trading-bot              | Plum, an aubergine grey       | Copper   |
| cv                       | Midnight, a deep navy         | Lavender |

Without the tokens, each app would copy the values, and the copies would drift.

## How it works here

The source is a set of JSON files in the format of the W3C's design tokens group, under `src/tokens`:

| Folder            | What it holds                                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `base`            | The tokens that do not change with the product or the mode: type, spacing, corners, motion, layout, control sizes and the colour roles         |
| `color/<product>` | The colour ramps of one product, `default` for the template: its background, its accent and the four states, each with a light and a dark half |
| `color/scale-*`   | Which half of each ramp a mode reads                                                                                                           |
| `mode`            | The surfaces and the elevation of each mode                                                                                                    |

`resolver.json` says which files form the base, which belong to each product and which to each mode. Terrazzo builds them into `dist/tokens.css`:

- the template's colours in the dark mode at `:root`, so a page with no attribute is dark and in the template's colours;
- the light mode at `:root[data-mode="light"]`, and at `:root[data-mode="system"]` when the system prefers light;
- each product's colour ramps at `:root[data-product="<product>"]`.

Only the tokens that a product or a mode owns are written again, so a radius or a font is set once. A colour role, such as `--ds-color-accent-solid`, points at a step of a ramp; the product decides the ramp, and the mode decides which half of it that step reads. Components use roles, never the ramps themselves.

### The generator

The colour files under `color/` are generated, never written by hand. Each product has two seeds in `src/palette/seeds.ts`, a background and an accent, as colours in OKLCH, a colour space whose lightness looks even across hues. `pnpm --dir packages/tokens run generate` builds twelve steps per ramp from each seed and writes the files:

| Steps  | Job                              | Placed by                                   |
| ------ | -------------------------------- | ------------------------------------------- |
| 1 to 3 | Page, raised and sunken surfaces | A fixed lightness curve                     |
| 4 to 7 | Hover, pressed and border tints  | A fixed lightness curve                     |
| 8      | Strong border                    | 3.1:1 against the surfaces                  |
| 9, 10  | Solid fill and its hover         | 4.6:1 with their label, white or near-black |
| 11     | Text                             | 4.6:1 against the surfaces                  |
| 12     | Strong text                      | 7.5:1 against the surfaces                  |

So contrast holds by construction. Where an accent sits close to a status colour, that status colour moves for that product: gpool's success is a leaf green, and trading-bot's danger leans toward crimson. The generator does its colour maths itself, with no library, and makes November's colours exactly.

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

The app sets the attributes on the root: the mode, to follow the system's light or dark, and the product, to wear its colours. The template sets no product, so it wears the template's colours:

```tsx
import { themeAttributes } from '@zigordev/tokens';

<html lang="en" {...{ [themeAttributes.mode]: 'system', [themeAttributes.product]: 'gpool' }}>
```

A new product's colours start in toolkit: add its name to `products` in `src/index.ts`, its seeds to `src/palette/seeds.ts`, its context to `src/tokens/resolver.json`, then run `pnpm --dir packages/tokens run generate`. Until a release carries them, the product wears the template's colours.

## How to check that it works

- `pnpm exec vitest run --project tokens` in `toolkit` reads `dist/tokens.css`, so build first with `pnpm --dir packages/tokens run build`. The tests check that dark is the default, that light changes the colours and nothing else, that each product block changes only its colours, that the committed colour files are what the generator writes, and that every colour pair the components draw meets WCAG 2.2 AA in every product and mode: 4.5:1 for text, 3:1 for field borders and the focus ring.
- A test that says a colour file does not match the generator means the file was edited by hand, or a seed changed without `generate`. Run it, and commit both.
- A colour that looks wrong in one product or mode usually points at a seed in `src/palette/seeds.ts`. Storybook shows every product and mode, with the Product and Mode switches in its toolbar: `pnpm --dir packages/ui run storybook`.
