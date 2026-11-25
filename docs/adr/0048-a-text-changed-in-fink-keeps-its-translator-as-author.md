# 0048. A text changed in Fink keeps its translator as author

- Status: proposed
- Date: 2026-11-25
- Supersedes: none

## Context

[Record 0028](0028-translations-checked-by-inlang-edited-in-fink.md) keeps every text in two JSON files in git, and lets a person who is not a developer change a text in Fink, inlang's web editor, which turns the change into a pull request. It left one question for the step that builds the interface: the core rule that every commit is made as zigordev needs an answer for a translator's commits.

Fink's own docs, read on 2026-11-25, add a second question. Fink commits through GitHub as the person who signed in, and adds to every commit a co-author line of its own, which names Fink and its address at inlang.com. It pushes only to an existing branch or to a fork, never to `main`, and leaves the pull request to the person. Two core rules refuse such a commit today: every commit is authored as zigordev, and no commit carries a co-author line.

The owner chose on 2026-11-25, in their words: "Narrow exception (Recommended)".

## Decision

- A commit that changes only files named `<language>.json` in a `messages/` folder may have another author and committer than zigordev, and may carry Fink's co-author line.
- When every commit of a pull request is such a commit, its description may carry Fink's line too, because GitHub copies a single commit's message into it.
- The `identity` and `attribution` rules of `zigordev check` accept exactly that, and nothing else. A commit that changes any other file, or carries any other co-author line, is held to both rules as before.
- The core rules name the exception, as they name Renovate's.
- A pull request from Fink waits for the owner, who marks it ready, and merges like any other once `check` is green. The translation check of record 0028 runs on it.

## Consequences

- A person who is not a developer can change a text, as record 0028 intends, and the change is reviewed and checked like code.
- `main` shows commits by translators, each changing texts only, which the check proves.
- A squash merge keeps the translator as the author of the commit on `main`, and GitHub keeps Fink's line in it.
- A developer who wants to change code and texts together does it as zigordev, as before.

## Alternatives considered

- **Re-make each Fink change as zigordev.** A workflow would turn each pull request from Fink into a clean commit and close the original. The core rules would stay whole, at the cost of a workflow with write access and a token for the owner to create and store.
- **No Fink.** Texts would change only through pull requests made as zigordev, the files-only alternative of record 0028, and only a developer could change a text.
