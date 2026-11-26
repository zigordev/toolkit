# Web apps

This page covers what step 6.5 builds into a web app: its texts in English and Spanish and how a translator changes one, the design system on its pages, its content security policy, and the browser check of every page. Browser monitoring joins this page as step 6.5 adds it.

## What it is

A product's web app is a Next.js app that shows what its API says. Every text a person reads in it exists twice, in English and in Spanish, in two files in git.

| Piece              | Where it lives                                          | What it does                                                                                                                                                   |
| ------------------ | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `messages/en.json` | In the web app's folder                                 | Every text in English, the base language, under a name such as `signIn.title`                                                                                  |
| `messages/es.json` | Beside it                                               | The same names, with the texts in Spanish                                                                                                                      |
| next-intl          | In the web app                                          | Picks the language of each request, and gives each page its texts                                                                                              |
| `project.inlang/`  | In the web app's folder                                 | Tells inlang's tools where the texts are: its `settings.json` names the languages, the plugin and the files                                                    |
| The `texts` rule   | `zigordev check`, in `pnpm check` and in CI             | Runs `inlang check`, which fails on a text missing or empty in one language, short of a variable, or used by no code                                           |
| Fink               | A web editor at fink.inlang.com, run by inlang's makers | Lets a person who is not a developer change a text in the browser and push it to a branch, for a pull request. We host nothing. Step 6.5 tries it on this repo |

| The design system | `@zigordev/ui` and its stylesheet, in every page | Every button, field, checkbox and message on a page, in light and in dark |
| The proxy | `src/proxy.ts` in the web app | Gives each page a content security policy with a fresh nonce |
| The page check | `browser/pages.test.ts` in the web app | Opens every page in Chromium, in both languages and both modes, and fails on an axe finding or on anything the policy blocks |

## Why we have it, and what we would lose without it

The products serve people who read English and people who read Spanish. Without the two files, a text would sit in the code, in one language, and a translation would mean a developer's change in every page.

November ran a translation server, Tolgee, which served the texts at runtime and failed without a sound when it was down. [Record 0028](../adr/0028-translations-checked-by-inlang-edited-in-fink.md) keeps the texts in git instead: a text is reviewed and merged like code, nothing fetches texts while the app runs, and a check proves that both languages hold every text.

## How it works here

### Which language a page speaks

Each request picks its language in this order, in `src/i18n/locales.ts`:

1. The language the person chose with the switch at the top of every page, kept for a year in the cookie `template.locale`.
2. The browser's `Accept-Language` header, by weight and then by order, taking the language without its region: `es-MX` means Spanish.
3. English.

The address does not change with the language, as in November's apps. The page's `<html lang>` follows the language, so a screen reader reads it right. The switch writes the cookie through a server action, so it also works before the page's script has loaded.

### The pages, on the design system

The root layout loads the stylesheet of `@zigordev/ui` and its two fonts, from Fontsource, and sets `data-mode="system"` on `<html>`, so the page follows the person's light or dark setting. It draws a header, with the product's name and the language switch, and one `<main>`, which holds each page.

Every element comes from the design system: `TextField`, `TextArea`, `Checkbox`, `Button`, `LinkButton` and `Alert`. The app's own CSS Modules only place them, with the tokens: `layout.module.css` and `forms.module.css`.

Every form uses React Hook Form, with a Zod schema from `src/lib/forms.ts` and the small resolver there. A field that fails shows its message under it in the person's language, says `aria-invalid`, and takes the focus. The schemas turn Zod's JIT off, with `z.config({ jitless: true })`, because Zod otherwise tries `new Function` once in the browser, which the policy refuses and reports.

### The content security policy

`src/proxy.ts` runs before every page. It makes a fresh nonce, a random value of 16 bytes, and sets this policy on the page, and on the request that Next.js renders, which stamps the nonce on each of its own scripts:

| Directive             | Value                               | What it allows                                                                        |
| --------------------- | ----------------------------------- | ------------------------------------------------------------------------------------- |
| `default-src`         | `'self'`                            | Anything the other directives do not name, from the page's own origin only            |
| `script-src`          | `'self' 'nonce-…' 'strict-dynamic'` | Scripts that carry the nonce, and the scripts they load. No inline script without it  |
| `style-src`           | `'self' 'nonce-…'`                  | Stylesheets from the origin, and style elements that carry the nonce. No inline style |
| `img-src`, `font-src` | `'self'`                            | Images and fonts from the origin                                                      |
| `connect-src`         | `'self'`                            | Requests to the origin, where the API answers under `/api/v1`                         |
| `object-src`          | `'none'`                            | No plug-ins                                                                           |
| `base-uri`            | `'none'`                            | No `<base>` element that would move every relative address                            |
| `form-action`         | `'self'`                            | Forms send only to the origin                                                         |
| `frame-ancestors`     | `'none'`                            | No other site may show the page in a frame                                            |

It can be this strict because the web app and its API share one address, as [record 0014](../adr/0014-one-address-per-product.md) says. Under `next dev` the proxy also allows `'unsafe-eval'` and WebSockets, which the dev server needs, and never in a build.

A nonce works only on a page that is rendered per request, so the root layout calls `connection()`, and no page is prerendered. A page never sets a `style` attribute: the browser's checkbox stands in for Base UI's, whose hidden input carries one, and the app has its own 404 page and error page, because those of Next.js carry inline styles.

### How a page reads its texts

`src/i18n/request.ts` gives next-intl the language and its messages for each request. A server component reads its texts with `getTranslations`, and a component that runs in the browser with `useTranslations`. The root layout hands the messages to the browser's components through `NextIntlClientProvider`.

The names are typed. `src/i18n/messages.ts` tells next-intl that the messages have the shape of `en.json`, so `t('signIn.titel')` fails the type check, and so does a Spanish file that lacks a name.

A text with a value inside uses a variable, as in `"trust": "Trust this device for {days} days"`, read with `t('trust', { days: 30 })`. The check makes sure the Spanish text names the same variables.

### The check

The `texts` rule of `zigordev check` runs `inlang check` on each committed `project.inlang`, with the command line and the next-intl plugin from the web app's own devDependencies. It fails on:

| Finding             | Example                                                                     |
| ------------------- | --------------------------------------------------------------------------- |
| A text missing      | `signIn.passkey` exists in `en.json` and not in `es.json`, or the other way |
| A text empty        | `"apiDown": ""`                                                             |
| A variable missing  | The Spanish text of `twoFactor.trust` lacks `{days}`                        |
| A text no code uses | A name that no `t(...)` in the app's `src` folder reads                     |

So a page never shows a raw name, and the files hold no text that nobody reads. The check finds a usage only when the name is written out in the code, so a page never builds a name from pieces: it picks one of the names in a `switch`, as `src/lib/problems.ts` does.

The plugin is installed from npm at the catalog's exact version, and `settings.json` names it by its path in `node_modules`. The documented setup loads it from a public CDN at its latest version instead, which our supply-chain rules do not allow. inlang's machine translation is never used: it would send the texts to a service outside.

### The page check

`browser/pages.test.ts` starts the web app from its build with `next start`, with a small stand-in for the API, and opens every page in Chromium through Playwright: in English and in Spanish, in light and in dark, signed in where a page needs it, and the 404 page too. On each it checks that:

- the page answers with its status and its policy;
- `<html lang>` is the language asked for;
- axe finds nothing;
- the policy blocked nothing, and the browser logged no error.

One more case serves the start page with an inline script that has no nonce, and checks that the browser refuses it and reports it, so the check proves that the policy holds. `pnpm test:pages` runs it, after `pnpm build`, and the pipeline's Stories job runs it after the stories, in the pinned Playwright image.

### Changing a text in Fink

Step 6.5 tried it on 2026-11-26, and the change arrived as toolkit#145:

1. A developer pushes a branch for the translator, such as `chore/texts-spanish`, from `main`. Fink cannot create a branch, and `main` refuses its pushes.
2. The translator opens `https://fink.inlang.com`, enters `zigordev/toolkit`, and chooses Open. The repo has one inlang project, so Fink opens it at once. They switch to the branch with the branch menu in the header.
3. They change the text, choose Review, then Push. Fink asks them to sign in with GitHub, and pushing needs the Inlang GitHub App on the repo.
4. Fink commits through GitHub's API, as the person, with GitHub as the committer, its own message `chore: update translations`, and its co-author line. It changes only the messages files, and keeps their order, indentation and final newline.
5. Someone opens the pull request: Fink does not, for a person with write access. The `identity` and `attribution` rules accept the commit, as [record 0048](../adr/0048-a-text-changed-in-fink-keeps-its-translator-as-author.md) says, and it waits for the owner, who marks it ready.

The Inlang GitHub App asks for write access to the repo's administration, contents and workflows. The owner chose on 2026-11-26 to install it on toolkit for the trial only, and to remove it right after. A translator who comes later needs that choice again.

The trial taught one rule: **a test never repeats a text**. It reads it from the messages, through `textsIn` in `test/texts.ts`, so a translator's change cannot break a test. The first run of toolkit#145 failed on a test that held the old Spanish sentence.

## How to use it

To add a text:

1. Add the name and the English text to `messages/en.json`, under the page's own group, such as `account`.
2. Add the same name with the Spanish text to `messages/es.json`.
3. Read it in the page: `const t = await getTranslations('account')` on the server, or `const t = useTranslations('account')` in the browser, then `t('newName')`.
4. Run `pnpm exec zigordev check texts`. It names any text missing, empty, short of a variable or unused, with its file and line.

Copy is short and in sentence case, with no emoji and no exclamation mark, and a button is a verb, as the web rules say. A test that checks a page reads the text with `textsIn('en')('account.title')`, and never writes it out.

## How to check that it works, and what to do when it does not

- `pnpm exec zigordev check texts` passes, and `pnpm check` runs it.
- The web app's tests render each page in English and in Spanish, through the real messages.
- On the laptop, `pnpm dev web` and the switch at the top of a page show both languages.
- `pnpm build`, then `pnpm test:pages`, checks every page in Chromium with axe and the policy.

| What you see                                                   | Why                                                        | What to do                                                                  |
| -------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| `the text "x.y" is missing in es: add it to this file`         | A name exists in one file only                             | Add it to the other file, or remove it from both                            |
| `no code uses the text "x.y"`                                  | No `t('y')` reads it in the app                            | Use it, or remove it from both files                                        |
| `the inlang command line is not installed in apps/<name>-web`  | The web app lacks `@inlang/cli` or the plugin              | Add both to its devDependencies, as the template has them                   |
| `inlang cannot read the project: PluginImportError`            | `settings.json` names a plugin path that does not exist    | Run `pnpm install`, and check the path in `modules`                         |
| A page shows a name such as `signIn.title` instead of the text | The name is missing in the messages of that language       | The check should have failed: run it, and add the text                      |
| The page check names `script-src-elem inline` or a script file | A script without the nonce, or a page that was prerendered | Render the page per request, and add no inline script by hand               |
| The page check names `style-src-attr inline`                   | An element with a `style` attribute                        | Move the style into a CSS Module, or use the component of the design system |
| The page check names an axe rule, such as `color-contrast`     | The page breaks that rule, in one mode or one language     | Fix the page, with the design system's components and roles, not the check  |
