# 0068. Every product follows one look for its main content

- Status: accepted
- Date: 2026-11-27
- Supersedes: none

## Context

On 2026-11-27 the owner looked at the mockups of gpool, trading-bot and the CV in the navigation plan, and said of their main content: "exactly the look I want to keep once we create the real products, those clean design there are exactly what I expect". The mockups were drawn to show the navigation of [record 0060](0060-every-app-navigates-from-one-list-of-places.md). Their content was drawn with the design system's tokens: tiles with a number, cards with a pill, one solid action, a segmented switch and a hero.

`@zigordev/ui` already has the buttons, the top bar, the breadcrumbs and the navigation. It has no tile, no pill, no segmented control and no hero. No product has its pages yet, and the template's pages were made before this look.

## Decision

- The main content of every product, and of the template, follows the look of those mockups, as the handbook's page [The product look](../handbook/the-product-look.md) describes it: its patterns, its tokens and its pictures.
- The pictures of the three mockups, in dark and in light, live in `docs/handbook/images`. A page is reviewed against them.
- The patterns that `@zigordev/ui` lacks become components there, and in `@zigordev/ui-native` for the phone apps, each once the owner agrees. Until then a product draws them with the tokens the handbook names.
- A pattern a product needs that the page does not show is drawn in toolkit first, in the same style, and added to the page.

## Consequences

- Every product starts from the same calm pages, in its own colours and in both modes.
- The template's pages move to the look in later changes.
- The tokens the look needs stay: the sunken surface of the segmented control, and the display type of the hero. A clean-up of unused tokens keeps them.
- The look is the owner's taste. Changing it takes a new record that supersedes this one.

## Alternatives considered

- **Each product designs its own pages**: the most freedom, and the drift the design system exists to prevent.
- **A ready-made kit of dashboard pages**: quick to start, but its look is not the owner's, and it adds a dependency.
- **The pictures alone, without patterns and tokens**: quicker to write, but every product would measure the pictures by eye.
