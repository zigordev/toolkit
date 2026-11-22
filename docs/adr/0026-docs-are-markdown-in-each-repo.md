# 0026. Docs are Markdown in each repo

- Status: accepted
- Date: 2026-11-21
- Supersedes: none

## Context

The owner wants documentation that teaches: what each piece is, why it exists and how to use it. The old rules also made every change to the architecture or the pipeline update a case study in the CV, in two languages, through a separate pull request.

## Decision

Every repo answers the same five questions in the same five places, in plain Markdown: `README.md`, `docs/local-first-start.md`, `docs/cloud-first-deploy.md`, `docs/user-manual.md` and `docs/adr/`.

`toolkit` adds a handbook in `docs/handbook/`, with one page per piece of the platform and a reading order. `platform` holds the runbooks. A diagram is a Mermaid code block. The duty to update the CV on every change is dropped for good.

## Consequences

- There is no extra tool and no site to keep.
- There is no search across repos. The reading order of the handbook is the guided path.
- Three checks keep the docs true: a pull request that changes behaviour changes its docs, CI lints the Markdown and follows every link, and the conformance check fails when one of the five places is missing.
- The CV describes the projects in its own words, when the owner chooses.

## Alternatives considered

- **A documentation website.** Searchable and guided, built from the same Markdown and hosted on GitHub Pages: one more tool to keep.
- **Keep the CV duty and collect the changes.** A list in each repo that becomes CV text later.
- **Drop the CV duty until the CV is rebuilt.** The rule would be decided again then.
