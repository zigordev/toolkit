# 0060. Every app navigates from one list of places

- Status: accepted
- Date: 2026-11-27
- Supersedes: none

## Context

On 2026-11-27 the owner asked for a state-of-the-art navigation that most web and mobile apps will share, and that adapts to many situations. The plan put three patterns side by side: tabs for gpool, a sidebar for trading-bot and a header for the CV. Material Design and Apple's guidelines agree on the main points: a few main places stay visible, a bottom bar on a phone and a rail or a sidebar on a wider screen. The design system had no navigation and no icons. The template drew its own header.

The owner took four decisions, one at a time: Lucide as the icon set, a bottom bar on phones for the template, the command palette now in every app, and the shell first with the palette second.

## Decision

- Each app writes its main places once, as data: an address, a label and an icon name. `@zigordev/ui` types it as `Place`.
- `AppShell` frames every page: a skip link first, a `TopBar`, the app's places in an `AppNav`, and one `main`.
- `AppNav` is a bar at the bottom of the screen below 600 px wide, and a rail beside the content from 600 px, Material Design's line between compact and medium windows. The current place says `aria-current="page"`. The links come from the server and work before any script loads.
- Icons come from Lucide, under the ISC licence, through `lucide-react`. `@zigordev/ui` offers them by Lucide's own names, in one list, and adds a name when a product needs it. The mobile app can draw the same names with `lucide-react-native`.
- The template shows Home, Notes and Account in the bar on phones and in the rail on wider screens.
- The next builds come in this order: the command palette, in every app; the sidebar with groups, breadcrumbs and page tabs; the account menu and the menu sheet. The mobile app's tab bar follows with its native components, from the same places.

## Consequences

- Every app moves around the same way, in its own colours, and a fix to the navigation reaches all of them with one release.
- The stories test the shell at a phone's, a tablet's and a computer's width, in every product's colours and both modes, with axe. The template's page check adds a case on a phone's width.
- `@zigordev/ui` depends on `lucide-react`. A bundler keeps only the icons a page imports.
- The breakpoint is a fixed width in two stylesheets, because a CSS variable cannot set a media query.
- A new icon is a change in toolkit and a release, like a product's colours in [record 0058](0058-each-product-wears-its-own-colours.md).

## Alternatives considered

- **A menu button and a drawer on phones** for the template: the content gets the whole screen, but the places hide behind a tap. The owner chose the bottom bar.
- **Phosphor icons**: MIT, six weights with a filled one for the current place, but its React Native package is a community project.
- **Material Symbols**: Apache 2.0 and the icons Android shows, but shipped as a font that loads far more than a page uses.
- **The command palette later, with trading-bot**: no work for apps with few places. The owner chose to build it now, so every app has it from the start.
- **A navigation written by each app**: the most freedom, and the drift the design system exists to prevent.
