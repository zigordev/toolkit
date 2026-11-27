# 0067. Sites with a few pages put their links in the top bar

- Status: accepted
- Date: 2026-11-27
- Supersedes: none

## Context

[Record 0060](0060-every-app-navigates-from-one-list-of-places.md) named three patterns of navigation. Pattern C is for a site that people read rather than work in, with a handful of pages, such as the CV. The plan shows it this way: on a phone, the name and a menu button that opens a sheet as big as the screen, with big links and the language switch; wider, all links in the top bar; between 600 and 839 px, the links fold into the menu if they do not fit.

The owner said to start the fourth build of the order on 2026-11-27. Its first half, the account menu, came in [record 0066](0066-the-account-menu-holds-the-persons-own-choices.md). This is the second half.

## Decision

- `TopBar` has a `nav` slot between the product's name and the actions, which takes the room that is left.
- `HeaderNav` shows the links there from 600 px wide, with `aria-current="page"` on the current one, in the accent's soft fill. It measures its room whenever the window changes. When the links do not fit, they fold into a menu button. Below 600 px the menu button always shows.
- The menu button opens the menu sheet: Base UI's drawer from the top, as big as the screen, with the name, a close button, the links in large type and an optional footer, such as the language switch. A swipe up, Escape, the close button, a chosen link or a change of address closes it.
- The links are plain links, so a wide screen gets them before any script loads. On a phone the sheet needs the script.
- `SideNav`, `NavDrawer` and `HeaderNav` read the width of the screen through one shared hook.

## Consequences

- The CV gets its navigation from toolkit, like the tools.
- A long name or a longer language folds the links into the menu instead of breaking the bar.
- The stories test the links on a computer and on a tablet with room for them, the fold with long Spanish names, and the sheet on a phone, in every product's colours and both modes, with axe.
- The template keeps its bottom bar.

## Alternatives considered

- **Folding one link at a time into a "more" menu**: the first links stay in view, but it needs one measurement per link and a second kind of menu. A site with a few pages folds them all at once.
- **Links that wrap to a second line**: no script, but a top bar that changes height and pushes the page down.
- **The side drawer of pattern B**: one component for both patterns, but it is made for many groups, and the plan's sheet gives a few pages big links.
