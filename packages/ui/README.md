# @zigordev/ui

The design system's components, and the one stylesheet that dresses them: the Button today, and each component a product needs later. Every component has stories, which are its browser tests.

The package is private until the owner publishes it for the first time.

## What it is

| Export       | What it is                                                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`     | A button in four variants (`solid`, `soft`, `outline`, `ghost`), three tones (`accent`, `neutral`, `danger`) and three sizes, with icons, an icon-only form and a loading state |
| `LinkButton` | A link that looks like the Button, for a move to another page. Its `render` prop hands it to a router's own link                                                                |
| `ui.css`     | One minified stylesheet: the tokens of [`@zigordev/tokens`](../tokens/README.md), a small reset, the base styles of the page, and each component's styles                       |

Two tools sit under it. Base UI gives the behaviour of each component: the keyboard, the focus and the right roles for assistive technology, with no styles of its own. Storybook is the showroom: it shows every component in every state, in both modes, on this Mac.

## Why we have it

[Record 0022](../../docs/adr/0022-design-system-starts-small-with-storybook.md) keeps the design system in `toolkit` and starts it with the colours and the Button as November left them. A component is added when a product needs it, never in advance.

Without it, each app would build its own buttons, each a little different, each with its own gaps in keyboard use and contrast. With it, a fix to a component reaches every app with the next version, and the web rules hold one thing true: every element of an app comes from here.

A component cannot ship without its stories, so it cannot ship untested. November's story tests left its pipeline after a browser download hung a run for 30 minutes on 2026-11-20. Here they run in the pinned Playwright image, which already holds the browsers.

## How it works here

### The styles

The stylesheet is plain CSS in `src/styles`, in five cascade layers, so a later layer always wins and an app's own CSS, outside any layer, wins over all of them:

```css
@layer ds.reset, ds.tokens, ds.base, ds.components, ds.utilities;
```

Lightning CSS bundles the files into `dist/ui.css` and lowers it for the browsers the platform supports: Chrome and Edge 111, Firefox 113, and Safari 16.4. A component's CSS uses tokens only: no raw length, duration or colour, and no colour ramp, only roles. A test reads every file and fails on a value that breaks this. System colours are allowed only for Windows' forced colours.

### The Button

The Button is Base UI's button with the brand's look on top. It is a `type="button"` unless it is told otherwise, so it never submits a form by surprise.

| State     | What it does                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------------- |
| Disabled  | Ignores clicks, and leaves the keyboard's order                                                           |
| Loading   | Shows a spinner in place of its icons, says `aria-busy`, ignores clicks, and keeps the focus where it was |
| Icon only | Needs an `aria-label`, which the type asks for                                                            |

Its focus ring follows the tokens, its spinner slows to a third of its speed when the system asks for less motion, and in forced colours it draws its border in the system's colours.

### The stories, which are the tests

Each component has a `*.stories.tsx` beside it. A story is one state of the component, and its `play` function is a test: it clicks, types and checks, as a person would.

Storybook's Vitest addon turns every story into a browser test, which runs in Chromium through Playwright, once in light and once in dark. After each story, axe checks the page, and any finding fails the story, contrast included. The run measures coverage of `src` against the floor of 90%.

| Where        | What runs                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| This Mac     | `pnpm test:stories` in `toolkit`, and Storybook itself with `pnpm --dir packages/ui run storybook`                  |
| The pipeline | The Stories job, inside `mcr.microsoft.com/playwright`, pinned by its digest, in every pull request and every merge |

The showroom runs on this Mac only. It is not published.

## How to use it

Add the package, with the fonts the tokens name:

```bash
pnpm add @zigordev/ui @fontsource-variable/mona-sans @fontsource-variable/jetbrains-mono
```

Load the stylesheet and the fonts once, at the root of the app:

```tsx
import '@fontsource-variable/mona-sans/wdth.css';
import '@fontsource-variable/jetbrains-mono';
import '@zigordev/ui/ui.css';
```

Then use the components:

```tsx
import { Button, LinkButton } from '@zigordev/ui';

<Button onClick={save} loading={saving}>Save note</Button>
<Button variant="outline" tone="neutral" onClick={cancel}>Cancel</Button>
<Button iconOnly aria-label="Delete note" tone="danger" variant="ghost" onClick={remove}>
  <TrashIcon />
</Button>
<LinkButton href="/notes/new">New note</LinkButton>
```

With Next.js, `LinkButton` hands its look to Next's own link:

```tsx
<LinkButton render={<Link href="/notes/new" />}>New note</LinkButton>;
```

A new component starts in its own pull request, with its CSS in `src/styles`, imported in `index.css`, its React code beside its stories, and its stories covering every state in both modes.

## How to check that it works

- `pnpm test:stories` in `toolkit` runs every story in Chromium, in light and in dark, with axe and with coverage. It needs Playwright's Chromium on the machine once: `pnpm exec playwright install chromium`. It builds nothing, so build the tokens first with `pnpm --dir packages/tokens run build`.
- `pnpm exec vitest run --project ui` checks the stylesheet: the bundle, its layers, the token-only rule on every file, and that the pipeline's Playwright image matches the Playwright version of the workspace.
- A story that fails with `Expected the HTML found at ... to have no violations` names the axe rule and links to its explanation. Fix the component, not the story.
- A story that fails in one mode only usually points at a colour role whose contrast holds in one half of its ramp. Open Storybook, switch the mode in the toolbar, and look.
- A story that fails with a link to `localhost:6006` can be opened in Storybook at that address, with the steps of its `play` function in the Interactions panel.
