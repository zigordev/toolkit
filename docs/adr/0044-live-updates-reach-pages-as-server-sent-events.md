# 0044. Live updates reach pages as Server-Sent Events

- Status: accepted
- Date: 2026-11-25
- Supersedes: none

## Context

On 2026-11-24 the owner asked for an opt-in capability beside Kafka: an app's API that tells its open web pages when something changed, in their words "as some apps will need it".

trading-bot did this with WebSockets. One route sent every event to every open socket from memory, and the page then fetched the data again through the API. The route had no sign-in and no heartbeat, a page missed what happened while it was offline, and a second running copy of the API, as during a deploy, split the pages between the copies.

The owner took four decisions on 2026-11-24, one at a time. In their words:

1. The transport: "A: Server-Sent Events", a stream of messages from the server over plain HTTP.
2. How every running copy hears of a change: "A: PostgreSQL".
3. What a message carries: "A: what changed".
4. Where it sits in the plan: "A: after step 6.5".

The owner accepted this record on 2026-11-25, in their words: "Accept 0044 (Recommended)".

Facts checked on 2026-11-25:

- Cloudflare, in front of every product, ends a request that sends nothing for 125 seconds, on every plan below Enterprise. HTTP/2 is on by default, and a Free plan cannot turn it off.
- Without HTTP/2, a browser allows 6 open streams per site, across all its tabs. With HTTP/2 the limit is agreed with the server, 100 by default (MDN).
- PostgreSQL delivers a NOTIFY only when its transaction commits, and never from one that aborts. Its payload must be shorter than 8000 bytes in the default configuration.
- toolkit already ships `pg`, the PostgreSQL driver, which can LISTEN. `@fastify/sse` is at 0.6.2, below 1.0, so the rule "stable versions only" keeps it out.

## Decision

- Live updates are opt-in: an app switches them on when it needs them.
- The API streams Server-Sent Events on the app's own address under `/api/v1`, behind the normal sign-in check. The page sends through normal API calls. WebSockets come only by a decision of their own, when an app needs two-way messages.
- The code that saves a change sends a NOTIFY in the same transaction, and every running copy of the API keeps one connection that LISTENs, so every copy hears every change. An app on Kafka announces its changes through PostgreSQL like any other code.
- A message names what changed, such as a type and an id, never the data itself and never more than the user may see. Each user hears only what they may see. Notices are grouped to at most one per channel per second, and the page fetches the data again through the normal API.
- The stream sends a heartbeat every 30 seconds. A React hook reconnects with growing pauses and catches up after a gap. The clean stop ends every open stream.
- The messages' schemas are written once, in Zod, for the API and the page.
- Metrics count open streams and messages sent, labelled per app and type of message. No trace covers a message or a whole stream.
- It is built in a new step right after step 6.5, the interface, because it needs sign-in from 6.3 and the notes pages from 6.5. The journeys at the end of phase 6 test it with every other critical path.

## Consequences

- No new service and no new library: Fastify writes the stream, and `pg` listens.
- Each open page holds one connection to the API, and each running copy of the API one more connection to its database.
- In production HTTP/2 lifts the browser's limit. The laptop serves plain HTTP, so a seventh open tab of one app waits.
- A page refreshes its data through the normal API, so data that must stay live is not cached on the server.
- A value that changes many times a second would need a decision of its own.

## Alternatives considered

- **WebSockets, as trading-bot used.** Two-way, with `@fastify/websocket` 11.3.7 under MIT. A second protocol through Cloudflare, which closes idle sockets and ends them when it releases its own code.
- **Fan-out through Kafka.** It would serve only the apps on Kafka.
- **Memory only.** Nothing to set up, but a second running copy splits the pages, as in trading-bot.
- **A separate message server, such as Valkey** (BSD-3-Clause). One more service on the host for every app that opts in.
- **The data itself in each message.** No second fetch, but every message would need the API's own checks of who may see what, and NOTIFY's 8000 bytes would limit it.
- **AWS API Gateway's WebSocket APIs, the managed way.** $1.14 per million messages and $0.285 per million connection minutes in eu-west-1, and a second address beside the product's own.
