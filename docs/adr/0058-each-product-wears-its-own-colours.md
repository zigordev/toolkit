# 0058. Each product wears its own colours

- Status: accepted
- Date: 2026-11-27
- Supersedes: none

## Context

The design system started from November's one brand, lavender on anthracite for every app, as [record 0022](0022-design-system-starts-small-with-storybook.md) carried it over. On 2026-11-27 the owner compared accents and backgrounds on real components and chose another approach: every app shares the components, and each app wears its own colours. The products to be rebuilt are gpool, trading-bot and the CV. Today the template and the playground are the only apps.

The colour files said a generator made them, but that generator stayed in November's repo, so nobody could make them again from toolkit.

## Decision

- The components are the same for every app. Only the colours change per product.
- `@zigordev/tokens` holds one colour theme per product, named by the product: gpool wears pine with a mint accent, trading-bot plum with a copper accent, and the CV midnight with a lavender accent. An app sets `data-product="<name>"` on its root element, beside `data-mode`. Without the attribute a page wears the template's colours, lavender on anthracite, which the template and the playground keep.
- Each theme comes from two seeds, a background and an accent, through `pnpm --dir packages/tokens run generate`, to the contrast targets of before. Where an accent sits close to a status colour, that status colour moves: gpool's success to a leaf green at hue 135, and trading-bot's danger toward crimson at hue 12.
- Every story runs in the template's colours and in each product's, in light and in dark, with axe. A test checks every colour pair the components draw, in every theme and mode, against WCAG 2.2 AA.

## Consequences

- A product's colours live in one place, its seeds in `packages/tokens/src/palette/seeds.ts`, and change with one pull request and a release.
- A new product needs a toolkit change and a release before it has colours of its own. Until then it wears the template's.
- The story tests run 8 times instead of 2, about 10 s instead of 4 s on the owner's Mac.
- The generator now lives in toolkit, with its own colour maths and no new library. It reproduces November's colours exactly, so the template's colours did not change.
- Copper takes white labels at 4.6:1, just over the 4.5:1 line. The pair test guards it.
- `@zigordev/email` keeps the template's colours. Emails in a product's colours wait for the first product that sends its own.

## Alternatives considered

- **One brand for every app**, November's way: the most consistent look and the least to test. The owner wants each app to have its own character.
- **Colours chosen by name in each app**: the tokens would offer the backgrounds and the accents by name, and each app would set two attributes, such as a pine background and a mint accent. The shared package would name no app, and a new product would need no toolkit change. The owner chose one list in toolkit, where every app's colours are seen and changed together.
- **Other colours**: an apricot accent and an umber background, a warm charcoal, were compared on 2026-11-27 and set aside for now.
