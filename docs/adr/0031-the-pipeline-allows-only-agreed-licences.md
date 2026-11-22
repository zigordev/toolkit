# 0031. The pipeline allows only agreed licences

- Status: accepted
- Date: 2026-11-22
- Supersedes: none

## Context

On 2026-11-22 the licence of every tool of the platform was read by hand, and nothing blocks an app that earns money. That reading is a snapshot. Every update can bring a new dependency, most of them indirect, and each one comes with its own licence. A licence can ask for more than a product can give, such as publishing the product's own code.

The Dependencies job already reads what a pull request adds, to find known flaws. Its action, Dependency Review, can also compare the licence of each added dependency with a list.

## Decision

The Dependencies job fails a pull request that adds a dependency under a licence that is not on the list of allowed licences. The list is in `check.yml`, so every repo that calls the pipeline gets the same one.

The list starts with the nine licences that GitHub reports for the 287 dependencies of `toolkit` on 2026-11-22: 0BSD, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, MIT, MPL-2.0, PSF-2.0 and Python-2.0.

## Consequences

- A new licence shows on the pull request that brings it, before anything is built on the dependency.
- The list grows one licence at a time, and each addition is a look at what that licence asks for.
- A dependency whose licence GitHub cannot read is reported, and it does not fail the job.
- The job judges what a pull request adds or changes. What was already installed is covered, because the list was made from it.
- MPL-2.0 is on the list because of Lightning CSS, a build tool that comes with Vite. That licence covers only the tool's own files: whoever changes them and passes them on has to publish the changes. We use the tool unchanged.
- The gate is free while a repo is public. In a private repo the action needs GitHub Code Security, which cost $30 for each active committer a month on 2026-11-22. It is the same condition that [record 0029](0029-codeql-stays-on-while-a-repo-is-public.md) describes for CodeQL.

## Alternatives considered

- **No gate, and a reading by hand before a product earns money.** There would be nothing to keep. A problem would show late, and the reading of 2026-11-22 covered the tools, not what they bring along.
- **A list of forbidden licences.** The same action offers one. Its maker has marked that option for removal, and a licence that nobody thought of would pass.
