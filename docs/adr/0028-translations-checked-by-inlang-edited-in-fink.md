# 0028. Translations are checked by inlang and edited in Fink

- Status: accepted
- Date: 2026-11-22
- Supersedes: none

## Context

Every text exists in English and in Spanish, in `messages/en.json` and `messages/es.json` in git, served by next-intl. The old estate ran a Tolgee server, which let a person edit texts in a console. It also served them at runtime, and that failed silently. Without it, only a developer could change a text.

## Decision

The two JSON files in git stay the only source. The inlang command line checks them inside `pnpm check`, and fails on a key that is missing or empty in one language. Fink, the web editor of inlang, lets a person who is not a developer change a text in the browser: they sign in with a GitHub account, and the change arrives as a pull request.

Both are tried in the step that builds the interface.

## Consequences

- There is no translation service to run, and nothing fetches translations at runtime.
- A text is reviewed and merged like code.
- A person who edits texts needs a GitHub account, and Fink needs access to it.
- The rule that every commit is made as zigordev needs an answer for a translator's commits, before that step.
- The inlang plugin for next-intl is pinned to an exact version, and machine translation stays off.

## Alternatives considered

- **Bring Tolgee back.** A full console for translators. Its docs ask for at least 2 cores and 4 GB of memory, its free self-hosted edition allows up to 10 seats, and it had failed as a runtime source.
- **The files alone, with no editor.** Only a developer could change a text.
