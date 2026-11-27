# 0063. Every app opens a command palette with Ctrl+K

- Status: accepted
- Date: 2026-11-27
- Supersedes: none

## Context

On 2026-11-27 the owner chose to build the command palette now, in every app with the template, and not later with trading-bot, the first product with many places. [Record 0060](0060-every-app-navigates-from-one-list-of-places.md) put it second in the build order, after the app shell, which merged the same day.

A command palette is a search box for an app's places and actions. GitHub, Linear and Vercel open theirs with Ctrl+K, or ⌘K on Apple devices. Base UI 1.9.0, which the design system already uses, shows one in its documentation: its autocomplete, inline in its dialog. So no new library is needed.

## Decision

- `@zigordev/ui` has a `CommandPalette`. It is a trigger button for the top bar, and a modal dialog with a search field and the results in groups.
- Ctrl+K or ⌘K opens the palette from anywhere on the page, and closes it again. The trigger shows the keys from 600 px wide, and tells assistive technology through `aria-keyshortcuts`.
- An app passes its commands as data: an id, a label, an optional icon, keywords and language, and what runs when the command is chosen. It passes every text too, so the palette speaks the app's language.
- The search ignores case and accents. It matches a command's label and its keywords.
- The template puts the palette in its top bar. It finds the same places as the main navigation, and the language the page is not in.

## Consequences

- A person can reach any place or action from the keyboard, in every app, the same way.
- A new place or action is one more entry in a list, and the palette finds it.
- The stories test the palette in every product's colours and both modes, with axe on the open dialog. The template's page check opens it with the keys, goes to a place and changes the language, under the content security policy.
- The palette adds Base UI's autocomplete and dialog to the pages that load it. They come from the same package as the other components.

## Alternatives considered

- **The palette later, with trading-bot**: no work for apps with four places. The owner chose to build it now, so every app has it from the start.
- **cmdk**, a palette library under the MIT licence: one more dependency beside Base UI, with its own focus and keyboard rules to keep in line with the others.
- **A search page in each app**: no overlay, but a jump costs a page load, and each app would build its own.
