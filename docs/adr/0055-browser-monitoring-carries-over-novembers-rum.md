# 0055. Browser monitoring carries over November's @zigordev/rum

- Status: accepted
- Date: 2026-11-26
- Supersedes: none

## Context

The plan puts Grafana Faro in every web page: it measures page speed, catches browser errors and starts a trace at each request, and posts to the product's own address, where the ingress hands the path to Alloy. The handbook lists Faro, used through `@zigordev/rum`. November built that package on 2026-11-20, with a filter that keeps queries, users and console output in the browser, after it found that Faro's defaults send full addresses and copy a user into every span.

On 2026-11-26, in step 6.5, platform's shared services had no Faro receiver in Alloy and no route for it, and another session was changing platform for step 5.6. The owner was asked how browser monitoring should land, with three options, and chose, in their words: "Toolkit half now (Recommended)".

Faro's web SDK 2.15.0 pins `ua-parser-js` 1.0.41, which reads the browser's name. pnpm's trust policy refused it: 1.0.41 carries no provenance, and its maintainer published it after the signed releases of the 2.x line, which is under AGPL-3.0. Every 1.x release, 1.0.37 to 1.0.41, is unsigned. Claude Code's permission system refused a session's edit of that policy, so the owner was asked, with four options: exempt 1.0.41 only, force the signed 2.x, build on OpenTelemetry's browser SDK instead, or hold browser monitoring. They chose, in their words: "Exempt 1.0.41 only (Recommended)", and then told the session to make the edit: "Yes, try it once".

## Decision

- **The package.** `@zigordev/rum` is November's package, carried over: `startRum` with Faro's web instrumentations and its tracing, console capture off, location lookup off, and the filter before every send. It starts as a private package, until the owner's first publish.
- **The address.** A web app sends to a path on its own address, set in `RUM_URL`, so its content security policy needs no other origin.
- **Off until the receiver exists.** The template starts Faro only while `RUM_URL` is set, and its compose files leave it out. Platform adds Alloy's `faro.receiver` and the route on each product's address, after step 5.6. A small pull request in toolkit then sets `RUM_URL`.
- **One exempt version.** `pnpm-workspace.yaml` exempts exactly `ua-parser-js@1.0.41` from the trust policy, with `trustPolicyExclude`. A Faro release that pins another version stops at the policy again, and comes back to the owner.

## Consequences

- The template's pages carry Faro now, and the page check proves it under the strict content security policy, with a stand-in for the receiver.
- No browser data reaches Grafana until platform's half lands. When it does, the data counts against Grafana Cloud's free 50 GB of logs and 50 GB of traces a month.
- A product can take the package from npm only after the owner's first publish, `pnpm exec zigordev first-publish @zigordev/rum`, and the pull request that makes it public.
- One unsigned package, of about 20 KB, sits in every product's pages.

## Alternatives considered

- **Wait for platform**, and leave browser monitoring out of step 6.5. Nothing ships switched off, but 6.5 cannot close, and the template is opened again for it.
- **Both halves here, later**: one session builds the receiver too, after 5.6. It waits for 5.6 anyway, and two sessions take turns in platform.
- **Force `ua-parser-js` 2.0.10**, which is signed. No exception, but AGPL-3.0 code in every product's pages, and Faro is untested on 2.x.
- **OpenTelemetry's browser SDK instead of Faro.** No `ua-parser-js`, but a tool the handbook does not list, more code of our own for page speed, errors and sessions, and a different receiver in Alloy.
- **Grafana Cloud's Frontend Observability**, Faro's hosted receiver, free up to 50,000 sessions a month and then $0.75 per 1,000. Pages would post to an address of Grafana's, which the policy would have to allow, and the data would bypass Alloy.
