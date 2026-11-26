# 0056. The Inlang GitHub App stays installed on toolkit

- Status: accepted
- Date: 2026-11-26
- Supersedes: none

## Context

Fink, the translators' editor of [record 0028](0028-translations-checked-by-inlang-edited-in-fink.md), can save a text only to a repo where the Inlang GitHub App is installed and the person has write access. The app belongs to the GitHub organization `generaltranslation`. On 2026-11-26 GitHub showed that it asks for read access to Actions, email addresses and metadata, and for write access to administration, contents and workflows. An installed app can use that access with its own key, at any time, and an owner can choose only the repos it gets, not narrower access.

toolkit publishes every `@zigordev` package to npm on each merge to `main`, and every product installs them. So a break-in at the app's maker could change toolkit's ruleset and workflows, and publish a package that reaches every product.

For the trial of step 6.5 the owner chose, in their words: "Toolkit, trial only (Recommended)", to install the app on toolkit alone and remove it after the pull request arrived. It arrived as toolkit#145 and merged. Asked then whether to remove the app, with its access and the reasons to keep it, the owner chose, in their words: "Keep it installed".

## Decision

- The Inlang GitHub App stays installed on toolkit, and on no other repo.
- A product repo gets the app only when the owner chooses so for it.
- The owner can see and remove the app at any time at `https://github.com/settings/installations`. GitHub asks the owner again before the app gets any access it does not hold today.

## Consequences

- Anyone with write access to toolkit changes a text of the template in Fink at any time, with no install first. Each change still arrives as a pull request on a branch, passes the checks, and waits for the owner to mark it ready, as [record 0048](0048-a-text-changed-in-fink-keeps-its-translator-as-author.md) says.
- The app's maker holds write access to toolkit's settings, code and workflows for as long as the app stays installed. The ruleset on `main` and the pipeline's required check stop no one who can change the ruleset itself.
- A person without write access still works from a fork in their own account, where the app is installed instead.

## Alternatives considered

- **Remove it now, and install it for each job.** No third party holds access between jobs, at the cost of an install and a removal each time.
- **Translators work from a fork in their own account.** The app never reaches the zigordev repos, and the checks on a fork's first pull request wait for the owner's approval. Untried.
