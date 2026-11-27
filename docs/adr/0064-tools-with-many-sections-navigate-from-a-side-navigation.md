# 0064. Tools with many sections navigate from a side navigation

- Status: accepted
- Date: 2026-11-27
- Supersedes: none

## Context

[Record 0060](0060-every-app-navigates-from-one-list-of-places.md) put the sidebar third in the build order of the navigation, after the app shell and the command palette, which both merged on 2026-11-27. The owner said to start it the same day. The plan shows it as pattern B, for a tool that people work in for hours, with groups of sections and deep pages, such as trading-bot's console. Its widths are Material Design's: below 600 px a top bar with a menu button and a drawer, from 600 px a rail, from 840 px a sidebar closed to the rail, and from 1200 px a sidebar that is open and that a person can close to the rail.

The plan named Base UI's Navigation Menu and Collapsible for the side navigation. Navigation Menu opens panels from its links and moves between them with the arrow keys. A sidebar whose groups always show needs neither: the W3C's pattern for site navigation is a list of links in a named landmark, reached with Tab. Base UI 1.9.0's drawer gives what a phone's menu needs: the swipe, the focus kept inside, and the page behind it held still. Base UI's tabs are the tab widget of ARIA, which is for panels on one page, and their indicator adds an inline script, which the template's security policy blocks without a nonce.

## Decision

- `@zigordev/ui` has a `SideNav`: the app's places in groups, as a rail from 600 px wide and as a sidebar from 840 px, closed to the rail by default below 1200 px and open from there. A button at its top opens and closes it, says `aria-expanded`, and keeps the person's choice for a year in the cookie `ds-side-nav`. The server reads the cookie and draws the sidebar as the person left it.
- `NavDrawer` is a menu button for the top bar of a phone, and Base UI's drawer from the left, with the same groups. A swipe, Escape, its close button, a tap beside it, a chosen place or a change of address closes it.
- `Breadcrumbs` shows the pages above a deep page as links, and the page's own name. A server component renders it. On a phone it keeps only the page above.
- `PageTabs` shows the sections of one page as links with their own addresses, not as ARIA tabs.
- When two places or tabs match the address, the longer address is current, in `AppNav` too.
- The four parts are links and buttons in plain HTML, laid out by the stylesheet, and add no library.
- The template keeps `AppNav`. Its note pages show breadcrumbs back to the list, in place of the button "All notes".

## Consequences

- trading-bot, and any tool like it, gets its navigation from toolkit, in its own colours, and behaves at every width like the other apps.
- The links work before any script loads. Only the button of the sidebar and the drawer need the script.
- The stories test the parts at a phone's, a tablet's, a small computer's and a computer's width, in every product's colours and both modes, with axe. The template's page check follows the breadcrumbs of a note in Spanish, on a computer and on a phone.
- The cookie holds a choice the person made, and nothing about them. Only the app reads it.
- The widths of the side navigation are fixed in its stylesheet, like the line at 600 px in record 0060.
- Groups that open and close, and a count beside a place, wait for a product that needs them.

## Alternatives considered

- **Base UI's Navigation Menu, upright, with Collapsible groups**, as the plan named: panels and arrow keys that a sidebar of plain groups does not use, and one more widget for assistive technology to explain.
- **The choice in the browser's local storage**: no cookie, but the server cannot read it. The sidebar would jump after the page loads, or need an inline script, which the security policy blocks.
- **A drawer at every width**: the content keeps the whole width, but every move costs two taps.
- **Base UI's tabs for the page tabs**: the tab widget is for panels on one page, its arrow keys replace the links' own way through, and its indicator needs a nonce.
