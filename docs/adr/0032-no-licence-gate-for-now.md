# 0032. No licence gate for now

- Status: accepted
- Date: 2026-11-22
- Supersedes: [0031](0031-the-pipeline-allows-only-agreed-licences.md)

## Context

[Record 0031](0031-the-pipeline-allows-only-agreed-licences.md) put a licence gate into the pipeline on 2026-11-22. The Dependencies job failed a pull request that added a dependency under a licence outside a list, and every new licence waited for the owner.

On its first day the gate stopped the work twice. Both times it was for semantic-release, a tool that only runs in the pipeline. First it brought four licences that were not on the list. Then GitHub's licence records gave one of its packages a licence that the package itself does not declare, read out of its README. Each case needed a decision from the owner.

## Decision

The licence gate is removed for now. The list of allowed licences goes with it, and so does the rule that a new licence waits for the owner.

The Dependencies job still fails a pull request that adds a dependency with a known flaw.

The owner comes back to licences later, and no date is set.

## Consequences

- No licence question stops the build.
- A dependency under any licence can arrive without anyone seeing it.
- The last look at licences is the reading by hand of 2026-11-22. It covered the platform's tools, and not what they bring along.
- What the gate needed is kept in the history of this repo: the list and its test in pull requests [17](https://github.com/zigordev/toolkit/pull/17) and [20](https://github.com/zigordev/toolkit/pull/20), and the rule for sessions in pull request [19](https://github.com/zigordev/toolkit/pull/19).

## Alternatives considered

- **Exempt the one package by name.** The gate would have stayed, and the next odd reading would have asked again.
- **Add that package's licence to the list.** One line, and any later package under that licence would have passed.
- **Replace semantic-release with a command of our own.** Its packages would have gone, and their licences with them, against the choice in [record 0008](0008-one-version-published-on-every-merge.md).
- **Agree to a set of common licences in advance.** There would have been fewer questions. The owner had turned that down earlier the same day, to decide each licence as it came.
