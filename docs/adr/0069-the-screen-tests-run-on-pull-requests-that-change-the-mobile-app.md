# 0069. The screen tests run on pull requests that change the mobile app

- Status: accepted
- Date: 2026-11-28
- Supersedes: none

## Context

[Record 0045](0045-mobile-apps-are-built-with-expo-beside-the-web-app.md) builds the template's mobile app with Expo and tests its screens with Maestro. toolkit#190, merged on 2026-11-27, added four Maestro flows: sign-in, two-factor, the notes, and the list. They ran only on the laptop, by hand, so a change that broke a screen could still merge green.

An iOS simulator runs only on macOS. An Android emulator runs on Linux with the processor's virtualisation, which GitHub's standard Linux runners allow. One run of the four flows, with its release build, takes 15 to 25 minutes on each.

Not every pull request touches the app. In the 150 merges into `toolkit` from 2026-11-23 to 2026-11-28, the lockfile changed 56 times, and most of those changes moved only packages the app never ships. A path filter that counted every lockfile change would have run the tests on 75 merges. Adding the API's packages would make it 93.

GitHub's own pages said on 2026-11-28 that standard runners, macOS included, cost nothing in a public repo. In a private repo a macOS minute costs $0.062 and a Linux minute $0.006, and the Free plan includes $12 a month. The Free plan runs at most 20 jobs at once, and at most 5 on macOS.

[Record 0034](0034-the-pipeline-and-the-host-run-one-named-ubuntu-lts.md) names `ubuntu-26.04` for every job of the pipeline.

The owner chose when the tests run on 2026-11-28. Asked "When should the pipeline run the screen tests?", they answered "Mobile PRs".

## Decision

`check.yml` takes the folder of a mobile app as the input `mobile-app`. On a pull request, the job Mobile changes asks `zigordev affected` whether the changes since the pull request's base reach the app. They reach it when they change any of these:

- the app's folder, or a workspace package it ships with
- a file it imports from outside its folder
- `mise.toml`
- the packages the app resolves to in the lockfile
- `ci.yml` or `check.yml`

When they do, two jobs build a release build and run every flow, against the API started by the job, on a PostgreSQL that only the job can reach:

- Screens (iOS) runs on `macos-26`.
- Screens (Android) runs on `ubuntu-26.04`.

Both jobs sit behind the gate `check`, like every other job. They run on pull requests only, never on `main`, so an emulator never holds up a release.

Asked about each of those 150 merges, `zigordev affected` said yes to 18. Eight changed a workflow file, before the app existed. The other ten came in the 15 merges after toolkit#175 started the app: the app's own changes, the design system's native components and tokens, and three changes to the web app's texts, which the app imports. None came from the lockfile alone.

`macos-26` is the one exception to record 0034. It is named exactly, never `macos-latest`. `packages/dev/src/pipeline.test.ts` holds it, with the rest of these rules.

Maestro's output keeps the run's test passwords, so no job uploads it, and the runner hides the passwords in the log.

## Consequences

- A pull request that changes the app waits 15 to 25 minutes for its screens before it merges. Every other pull request waits for none of it. While the app and its design system are being built, that is most pull requests in `toolkit`: 10 of the 15 merges after the app started.
- A new text in the web app runs the tests, because the app imports the web app's texts whole.
- A change to the API alone does not run them, even one made for phones, such as toolkit#176, which let the app sign in by its own scheme. The API's own tests cover such a change, and the next change to the app runs the screens against it.
- A screen that breaks on one phone only fails before the merge.
- At most 5 macOS jobs run at once across the account. A sixth waits in GitHub's queue.
- The runs cost nothing while `toolkit` is public. In a private repo, one run would cost about $1.70: about 25 minutes on macOS and 25 on Linux. The $12 a month would cover about seven runs.
- A flaky flow now holds up merging. The fix goes into the flow, never a skip.
- A change to a package the app resolves to counts even when the app does not use it, for example a peer dependency that moves. Such a change runs the tests when it did not need to, and never the other way round.
- The template's caller does not name its mobile app yet. A product names it in its caller once its pinned version of `toolkit` has these jobs.

## Alternatives considered

- **Nightly, on `main`.** One run a night, whatever merged. But a broken screen is found only after the merge, and `main` stays red until someone fixes it.
- **Every pull request.** No job to decide anything, but every pull request would wait 25 minutes, including the many that change nothing the app is built from, such as the platform's workflows and the docs.
- **GitHub's own path filter.** A workflow skipped by `paths` never reports a result, so a required `check` would wait for it forever. A path filter also cannot see which packages a lockfile change moves.
- **An affected-graph tool, such as Nx or Turborepo.** It answers this question and many more, but it would be a new tool for one question. pnpm already knows the workspace's graph and reads the lockfile with `--lockfile-only`.
- **Android alone, on Linux.** No macOS runner at all. But a break that shows on iOS only, such as the joined labels toolkit#190 met, would merge.
