# 0029. CodeQL stays on while a repo is public and earns nothing

- Status: accepted
- Date: 2026-11-22
- Supersedes: none

## Context

CodeQL scans our own code for vulnerable patterns on every pull request. It is the only tool in the pipeline that reads our code that way.

On 2026-11-22 a check of the licences of every tool found one mismatch. The written terms of CodeQL allow automated scans only on code that is released under an open-source licence. Our repos are public, and their code is unlicensed, as [record 0007](0007-packages-on-public-npm-unlicensed.md) says. GitHub's own documentation says that CodeQL is free to use on public repositories, and GitHub offers the scan on every public repo. The two texts do not match.

Every other tool of the platform is free for commercial use.

## Decision

CodeQL stays as it is, in every public repo.

The choice comes back at a named moment: before a product earns money, or when a repo goes private. For that repo the options are then to pay for GitHub's Code Security, or to switch CodeQL off there.

## Consequences

- Nothing changes in the pipeline.
- A small risk remains on paper. If GitHub ever objected, the remedy is to switch the scan off, and nothing but the scan is lost.
- No repo takes an open-source licence for the sake of a scanner.
- The owner left this choice to the proposal, on 2026-11-22.

## Alternatives considered

- **An open-source licence for the shared repos.** `toolkit` and `platform` would be clearly covered. It reverses the choice to keep the code unlicensed, and a product's repo would still not be covered.
- **Drop CodeQL now.** No question about terms would remain, and no tool would be left that reads our own code for vulnerable patterns.
- **Pay for GitHub's Code Security now.** The clear licence, for private repos too. It needs an organization on a paid plan and a licence for each committer, before anything earns money.
