# 0022. The design system starts with the colours and a Button, with Storybook

- Status: accepted
- Date: 2026-11-21
- Supersedes: none

## Context

November built a design system in its own repo. Its story tests left CI on 2026-11-20, after a browser download hung a run for 30 minutes. The proposal for the restart was a gallery page now, and Storybook once there are about ten components.

## Decision

The design system lives in `toolkit`, as `@zigordev/tokens` and `@zigordev/ui`. It starts with the colours and the Button as they are today. A component is added when a product needs it, never in advance.

Storybook is there from the start. A component's stories are its browser tests, and they run in CI on Chromium, inside the pinned Playwright image, in light and in dark, with an accessibility check. The showroom opens on the owner's Mac only.

## Consequences

- Storybook is a heavy tool for one Button.
- A component cannot ship without its stories, so it cannot ship untested.
- The image already holds the browsers, so no run waits for a download again.
- The showroom is not on the web.

## Alternatives considered

- **A gallery page now, Storybook later.** No isolated workshop until about ten components exist.
- **The showroom also on a public page.** Every change to the design system would publish it to GitHub Pages.
