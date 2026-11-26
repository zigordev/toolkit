# Web apps

This page covers what step 6.5 builds into a web app: its texts in English and Spanish, and how a translator changes one. The design system on the pages, the content security policy and browser monitoring join this page as step 6.5 adds them.

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

## How to use it

To add a text:

1. Add the name and the English text to `messages/en.json`, under the page's own group, such as `account`.
2. Add the same name with the Spanish text to `messages/es.json`.
3. Read it in the page: `const t = await getTranslations('account')` on the server, or `const t = useTranslations('account')` in the browser, then `t('newName')`.
4. Run `pnpm exec zigordev check texts`. It names any text missing, empty, short of a variable or unused, with its file and line.

Copy is short and in sentence case, with no emoji and no exclamation mark, and a button is a verb, as the web rules say.

## How to check that it works, and what to do when it does not

- `pnpm exec zigordev check texts` passes, and `pnpm check` runs it.
- The web app's tests render each page in English and in Spanish, through the real messages.
- On the laptop, `pnpm dev web` and the switch at the top of a page show both languages.

| What you see                                                   | Why                                                     | What to do                                                |
| -------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------- |
| `the text "x.y" is missing in es: add it to this file`         | A name exists in one file only                          | Add it to the other file, or remove it from both          |
| `no code uses the text "x.y"`                                  | No `t('y')` reads it in the app                         | Use it, or remove it from both files                      |
| `the inlang command line is not installed in apps/<name>-web`  | The web app lacks `@inlang/cli` or the plugin           | Add both to its devDependencies, as the template has them |
| `inlang cannot read the project: PluginImportError`            | `settings.json` names a plugin path that does not exist | Run `pnpm install`, and check the path in `modules`       |
| A page shows a name such as `signIn.title` instead of the text | The name is missing in the messages of that language    | The check should have failed: run it, and add the text    |
