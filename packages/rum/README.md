# @zigordev/rum

Browser monitoring for zigordev web apps: Grafana Faro in the page, sending to the product's own address, with no personal data leaving the browser.

## What it is

| Export              | What it is                                                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `startRum`          | Starts Faro once in a page: page speed, browser errors, a trace for each request the page makes, and its own events                             |
| `recordInteraction` | Sends one interaction that the app lists, such as `note.created`                                                                                |
| `RumOptions`        | What `startRum` takes: the app's name, version and environment, the address to send to, the APIs on other origins, and the list of interactions |

Faro is Grafana's library for the browser, under Apache-2.0. Its web SDK measures and collects, and its tracing package starts a trace for each `fetch` and carries it to the API in the `traceparent` header. This package is November's `@zigordev/rum`, carried over as [record 0055](../../docs/adr/0055-browser-monitoring-carries-over-novembers-rum.md) says.

## Why we have it

The server's telemetry shows what the server did. It cannot show what a visitor lived through: a page that took four seconds to draw, a button that threw an error in one browser, a click that waited on a slow API. Without it, such a problem shows only when someone complains.

The filter is the reason for a package of our own. Faro's defaults would send full addresses, queries included, and would copy a user set with `setUser` into every span. This package removes both before anything leaves the browser, so the rule "nothing personal" holds in the browser as it does in the services.

## How it works here

`startRum` starts Faro with its web instrumentations, console capture off, and the tracing instrumentation. Before Faro sends anything, the filter of `src/privacy.ts` runs on each item:

| What                                | What the filter does                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| A web address, anywhere in the item | Keeps its origin and path, and drops its query, its fragment and any credentials in it                 |
| The user                            | Drops `meta.user` and every `user.*` key and span attribute, even after a call to `setUser`            |
| An event the app sends              | Sends it only when its name is on the app's list of interactions, and drops it otherwise               |
| Faro's own events                   | Sends them: session, view, navigation, page speed, the traces of requests, and the policy's violations |
| The visitor's location              | Faro asks the receiver not to look it up                                                               |

Faro sends to `url`, which is a path on the product's own address, such as `/rum`, so the page's content security policy, `connect-src 'self'`, lets it through. On the laptop and on the host, the shared services route that path to Alloy's Faro receiver, which forwards the logs to Loki and the traces to Tempo. Until `platform` has that receiver and its route, a product leaves the setting out and nothing starts.

The requests to the page's own origin carry `traceparent`, so the API continues the browser's trace. An API on another origin carries it only when `apiOrigins` names it, and its CORS headers allow the header.

The filter cannot recognise personal data in free text, so an error message or an attribute carries none, as a log field does not. Faro keeps a random session id in `sessionStorage`, which ends with the tab, and sets no cookie.

Faro 2.15 brings OpenTelemetry's web packages at 2.12, whose peer range stops below the `@opentelemetry/api` 1.10 of the workspace, so pnpm warns. The tests and the template's page check run on it. Faro's web SDK pins `ua-parser-js` 1.0.41, which is not signed, and the workspace exempts exactly that version from pnpm's trust check, as record 0055 says.

## How to use it

Start it once, from a client component that the root layout renders:

```tsx
'use client';

import { startRum } from '@zigordev/rum';
import { useEffect } from 'react';

export function Rum({ url, app, version }: { url: string; app: string; version?: string }) {
  useEffect(() => {
    startRum({ url, app, version, interactions: ['note.created', 'note.deleted'] });
  }, [url, app, version]);
  return null;
}
```

A second call returns the running Faro, so a remount or a fast refresh starts nothing new. Record an interaction where it happens, after it worked:

```ts
import { recordInteraction } from '@zigordev/rum';

recordInteraction('note.created');
```

Names follow the log events' form, `area.what_happened`. A name missing from `interactions` is dropped in the browser, so a new interaction joins the list in the same pull request, as the web rules say.

## How to check that it works

- `pnpm exec vitest run --project rum` runs the filter's tests and the start's, in Node.
- The template's page check, `pnpm test:pages`, starts the web app with browser monitoring on, takes what Faro posts, and checks that it names the app and carries no query from the address, under the content security policy.
- Once the shared services have the receiver, Grafana's Explore shows the browser's lines in Loki under the app's name, and its traces in Tempo beside the API's.

| What you see                                        | Why                                                    | What to do                                              |
| --------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------- |
| The page check names `connect-src` and the receiver | `url` points at another origin                         | Use a path on the product's own address                 |
| An interaction never arrives                        | Its name is not in `interactions`                      | Add it to the app's list                                |
| Faro's posts answer 404 on the laptop               | The shared services do not route the path to Alloy yet | Leave the setting out until `platform` has the receiver |
