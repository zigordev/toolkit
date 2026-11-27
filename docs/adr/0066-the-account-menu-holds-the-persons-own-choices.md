# 0066. The account menu holds the person's own choices

- Status: accepted
- Date: 2026-11-27
- Supersedes: none

## Context

[Record 0060](0060-every-app-navigates-from-one-list-of-places.md) put the account menu and the menu sheet fourth in the build order of the navigation. The owner said to start them on 2026-11-27, after the sidebar merged. The plan describes the account menu as the person's name, the language, light or dark, the settings and sign out, built on Base UI's menu.

Until then the template showed its language switch to everyone, followed the system's light or dark with no way to choose, and offered sign out only on the account page. A first try put the open menu at the end of the page, as Base UI does by default. The page check's axe then found the menu's contents outside every landmark.

## Decision

- `@zigordev/ui` has an `AccountMenu`: a button in the top bar with the person's initials, and Base UI's menu with their name and a detail, choices as groups of options, links and sign out. The app passes every text and what each choice does.
- The open menu sits beside its button in the page, inside the top bar's landmark.
- The template shows the menu to a signed-in person, in place of the language switch: the language, light, dark or the system's setting, the account page and sign out. A visitor who is not signed in keeps the language switch.
- The template keeps the mode in the cookie `template.mode` for a year, and the root layout reads it, so the server sends the page in the chosen mode. The page changes mode at once, before the server answers.
- The root layout asks who is signed in, once per request, and the page reuses the answer. When the API cannot answer, the top bar shows what a visitor sees, and the log says why.

## Consequences

- Every app keeps the person's choices in the same place, in its own colours.
- A signed-in page asks for the session in its layout too. The answer is shared within the request, so a page that needs the user does not ask twice.
- The page check opens the menu with axe, turns the page dark, reloads it, switches the language and signs out, under the security policy. Its stand-in API answers the sign-out.
- The menu sheet of pattern C and its links in the top bar follow in a pull request of their own.

## Alternatives considered

- **The language switch beside the menu, for everyone**: one tap less to change the language, but two places for one setting, and a crowded top bar on a phone.
- **The mode in the browser's local storage**: the server cannot read it, so a dark page would flash light while it loads, or need an inline script, which the security policy blocks.
- **The open menu at the end of the page**, Base UI's default: its contents fall outside every landmark.
- **A plain icon on the button**: nothing to draw, but initials say at a glance who is signed in.
