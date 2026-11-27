# @zigordev/ui

The design system's components, and the one stylesheet that dresses them: the app shell and its navigation, the command palette, the Button, the form fields, the alert and the icons today, and each component a product needs later. Every component has stories, which are its browser tests.

## What it is

| Export           | What it is                                                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`         | A button in four variants (`solid`, `soft`, `outline`, `ghost`), three tones (`accent`, `neutral`, `danger`) and three sizes, with icons, an icon-only form and a loading state |
| `LinkButton`     | A link that looks like the Button, for a move to another page. Its `render` prop hands it to a router's own link                                                                |
| `TextField`      | A labelled one-line input, of any text type, with an optional description and an error                                                                                          |
| `TextArea`       | The same field with a text area, for text of several lines                                                                                                                      |
| `Checkbox`       | A labelled checkbox, with an optional description                                                                                                                               |
| `Alert`          | A message in a box, in four tones (`info`, `success`, `warning`, `danger`), with an optional title                                                                              |
| `AppShell`       | The frame of every page: a skip link first, the top bar, the app's main places and one `main`                                                                                   |
| `TopBar`         | The bar at the top of a page: the product's name at the start, and actions such as the command palette and the language switch at the end                                       |
| `AppNav`         | The app's main places: a bar at the bottom of a phone, and a rail beside the content from 600 px wide. It marks the current place                                               |
| `SkipLink`       | A link to the main content, hidden until a keyboard reaches it. `AppShell` puts one first                                                                                       |
| `Place`          | The type of one main place: an address, a label and an icon name                                                                                                                |
| `CommandPalette` | A search for the app's places and actions, opened with Ctrl+K or ⌘K or from its button in the top bar                                                                           |
| `Command`        | The type of one entry of the palette: an id, a label, an optional icon, keywords and language, and what it does. `CommandGroup` holds entries under a label                     |
| `Icon`           | One of the design system's icons, from Lucide, by its name                                                                                                                      |
| `ui.css`         | One minified stylesheet: the tokens of [`@zigordev/tokens`](../tokens/README.md), a small reset, the base styles of the page, and each component's styles                       |

Two tools sit under it. Base UI gives the behaviour of each component: the keyboard, the focus and the right roles for assistive technology, with no styles of its own. Storybook is the showroom: it shows every component in every state, in the template's colours and in each product's, in both modes, on this Mac.

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

### The app shell and the navigation

Every app frames its pages the same way, as [record 0060](../../docs/adr/0060-every-app-navigates-from-one-list-of-places.md) says. `AppShell` lays out four parts:

| Part        | Below 600 px wide, a phone                             | From 600 px                                         |
| ----------- | ------------------------------------------------------ | --------------------------------------------------- |
| Skip link   | First on the page, shown on the first press of Tab     | The same                                            |
| Top bar     | At the top, with the product's name and its actions    | At the top of the content, right of the rail        |
| Main places | A bar at the bottom of the screen, which stays in view | A rail beside the content, the height of the screen |
| `main`      | Between the two                                        | Beside the rail                                     |

The width is Material Design's line between compact and medium windows. `AppNav` takes the app's places, the address of the page shown, and an optional `renderLink`, which hands each place to a router's own link, as `LinkButton`'s `render` does. A place is current on its own address and on every address under it, so Notes is current on `/notes/42`, and the start page only on `/`. The current place says `aria-current="page"` and wears the accent's soft fill. Each place shows its icon and its label, so a tap target is never an icon alone, and a label too long for its slot ends in an ellipsis while its full text stays readable to assistive technology.

The links are plain links, so the navigation works before any script loads. `AppShell`, `TopBar` and `SkipLink` hold no state, and a server component can render them. `AppNav` runs in the browser too, so it can follow the address.

### The command palette

`CommandPalette` finds a place or an action by its name and goes there, as [record 0063](../../docs/adr/0063-every-app-opens-a-command-palette-with-ctrl-k.md) says. Every app puts one in its top bar.

| Part     | What it does                                                                                                                                                                                                |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Button   | A magnifier on a phone. From 600 px wide, a button shaped like a field, with its label and the keys: ⌘K on Apple devices and Ctrl K elsewhere. `aria-keyshortcuts` tells assistive technology the same keys |
| Shortcut | Ctrl+K or ⌘K opens the palette from anywhere on the page, and closes it again                                                                                                                               |
| Dialog   | Base UI's modal dialog. The focus moves to the search field and stays inside, and goes back where it was when the palette closes. Escape, the close button and a press outside close it                     |
| Search   | Base UI's autocomplete, inside the dialog. It matches a command's label and its keywords, and ignores case and accents, so `espanol` finds Español                                                          |
| Results  | The commands in their groups. The first match is highlighted, the arrow keys move, and Enter or a click runs the command. A group with no match hides, and the empty text shows when nothing matches        |

A command is data: an id, a label, an icon from the list, keywords, a `lang` for a label in another language, and `onSelect`, which runs when the command is chosen and the palette closes. The app builds its commands from its places and its actions, so the palette finds the same places as `AppNav`. The app passes every text, so the palette speaks its language.

Until it opens, the palette renders its button alone, which a server can render. The keys on the button come from the browser after the page starts, and the stylesheet draws them from a data attribute. So the server's HTML matches the browser's first render, and the keys are not part of the button's name, which is the label.

### The icons

`Icon` draws one of Lucide's icons, under the ISC licence, by its Lucide name, such as `house` or `notebook-pen`. `@zigordev/ui` lists the names it offers in `src/icon/icon.tsx`, and a product that needs another adds it there, in toolkit, as it adds its colours. A bundler keeps only the icons a page imports. An icon is decorative: it says `aria-hidden`, and the text beside it names the action.

### The Button

The Button is Base UI's button with the design system's look on top. It is a `type="button"` unless it is told otherwise, so it never submits a form by surprise.

| State     | What it does                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------------- |
| Disabled  | Ignores clicks, and leaves the keyboard's order                                                           |
| Loading   | Shows a spinner in place of its icons, says `aria-busy`, ignores clicks, and keeps the focus where it was |
| Icon only | Needs an `aria-label`, which the type asks for                                                            |

Its focus ring follows the tokens, its spinner slows to a third of its speed when the system asks for less motion, and in forced colours it draws its border in the system's colours.

### The fields

`TextField` and `TextArea` are Base UI's Field with an input or a text area inside. Base UI ties the parts together: the label names the control, and the description and the error describe it, so a screen reader reads all three.

| Prop          | What it does                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------ |
| `label`       | The visible name of the control. Every field has one                                                               |
| `description` | A hint under the control, which assistive technology reads with it                                                 |
| `error`       | A message under the control. While it is set, the control says `aria-invalid` and its border takes the danger role |
| `ref`         | Reaches the input or the text area itself, so React Hook Form's `register` works on it                             |

Every other prop goes to the input or the text area: `name`, `type`, `autoComplete`, `required`, `disabled`, `rows` and the rest.

`Checkbox` is the browser's own checkbox, coloured with the accent role, with its label beside it. It is not Base UI's checkbox, because that one renders its hidden input with an inline `style` attribute, and the strict content security policy of the web apps blocks inline styles. The browser's checkbox needs no script, works in a plain form, and keeps its own keyboard and forced-colours behaviour.

### The alert

`Alert` is a box for a message the person has to see: a form that failed, a step that worked. A `warning` or a `danger` alert has the role `alert`, so a screen reader reads it as soon as it appears. An `info` or a `success` alert has the role `status`, which waits for a pause. It holds no script, so a server component can render it.

### The stories, which are the tests

Each component has a `*.stories.tsx` beside it. A story is one state of the component, and its `play` function is a test: it clicks, types and checks, as a person would.

Storybook's Vitest addon turns every story into a browser test, which runs in Chromium through Playwright eight times: in the template's colours and in those of gpool, trading-bot and the CV, each in light and in dark. After each story, axe checks the page, and any finding fails the story, contrast included. The run measures coverage of `src` against the floor of 90%.

| Where        | What runs                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| This Mac     | `pnpm --dir packages/ui run test:browser` in `toolkit`, and Storybook itself with `pnpm --dir packages/ui run storybook` |
| The pipeline | The Browser job, inside `mcr.microsoft.com/playwright`, pinned by its digest, in every pull request and every merge      |

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
import { Alert, Button, Checkbox, LinkButton, TextArea, TextField } from '@zigordev/ui';

<Button onClick={save} loading={saving}>Save note</Button>
<Button variant="outline" tone="neutral" onClick={cancel}>Cancel</Button>
<Button iconOnly aria-label="Delete note" tone="danger" variant="ghost" onClick={remove}>
  <TrashIcon />
</Button>
<LinkButton href="/notes/new">New note</LinkButton>

<TextField label="Title" error={errors.title?.message} {...register('title')} />
<TextArea label="Body" rows={6} {...register('body')} />
<Checkbox label="Done" {...register('done')} />
<Alert tone="danger">The note was not saved.</Alert>
```

With Next.js, `LinkButton` hands its look to Next's own link:

```tsx
<LinkButton render={<Link href="/notes/new" />}>New note</LinkButton>;
```

The root layout frames every page in the shell. `AppNav` follows the address in the browser, so it sits in a small client component of the app:

```tsx
'use client';

import { AppNav, type Place } from '@zigordev/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Navigation({ label, places }: { label: string; places: readonly Place[] }) {
  return (
    <AppNav
      label={label}
      places={places}
      pathname={usePathname()}
      renderLink={(place) => <Link href={place.href} />}
    />
  );
}
```

```tsx
<AppShell
  skipLinkLabel={t('skipToContent')}
  topBar={<TopBar start={<LinkButton render={<Link href="/" />}>{t('name')}</LinkButton>} />}
  nav={
    <Navigation
      label={t('mainPlaces')}
      places={[
        { href: '/', label: t('home'), icon: 'house' },
        { href: '/notes', label: t('notes'), icon: 'notebook-pen' },
      ]}
    />
  }
>
  {children}
</AppShell>;
```

The palette runs in the browser, with the router of the app, so it sits in a small client component too. The app passes the texts in its own language:

```tsx
'use client';

import { CommandPalette, type Place } from '@zigordev/ui';
import { useRouter } from 'next/navigation';

export function Palette({ places }: { places: readonly Place[] }) {
  const router = useRouter();
  return (
    <CommandPalette
      label="Search"
      placeholder="Search places and actions"
      emptyLabel="Nothing matches"
      closeLabel="Close"
      groups={[
        {
          label: 'Go to',
          commands: places.map((place) => ({
            id: place.href,
            label: place.label,
            icon: place.icon,
            onSelect: () => router.push(place.href),
          })),
        },
      ]}
    />
  );
}
```

```tsx
<TopBar
  start={<LinkButton render={<Link href="/" />}>{t('name')}</LinkButton>}
  end={<Palette places={places} />}
/>;
```

A new component starts in its own pull request, with its CSS in `src/styles`, imported in `index.css`, its React code beside its stories, and its stories covering every state, which the tests then run in every product's colours and both modes.

## How to check that it works

- `pnpm --dir packages/ui run test:browser` in `toolkit` runs every story in Chromium, in every product's colours and in light and in dark, with axe and with coverage. It needs Playwright's Chromium on the machine once: `pnpm exec playwright install chromium`. It builds nothing, so build the tokens first with `pnpm --dir packages/tokens run build`.
- `pnpm exec vitest run --project ui` checks the stylesheet: the bundle, its layers, the token-only rule on every file, and that the pipeline's Playwright image matches the Playwright version of the workspace.
- A story that fails with `Expected the HTML found at ... to have no violations` names the axe rule and links to its explanation. Fix the component, not the story.
- A story that fails in one product or one mode only usually points at a colour role whose contrast holds in one theme and not another. Open Storybook, switch the Product and Mode in the toolbar, and look. The test names say which, such as `ui:stories gpool light`.
- A story that fails with a link to `localhost:6006` can be opened in Storybook at that address, with the steps of its `play` function in the Interactions panel.
