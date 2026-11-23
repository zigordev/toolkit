# @zigordev/api

The base every API of the platform stands on. One call gives a Fastify server that already speaks the platform's error format, checks sign-in, serves its OpenAPI pages and its health route, and names its routes for telemetry. Two more calls start it and stop it cleanly.

## What it is

Fastify is the web server framework of every API. Zod describes each request and answer, and the same description validates the request, types the handler and writes the OpenAPI document.

| Export                                                    | What it is                                                                                                  |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `createApi(options)`                                      | A Fastify server with everything below in place, ready for the app's features                               |
| `serve(app, options)`                                     | Listens, writes `service.started`, and returns a `stop(signal)` that ends the process cleanly               |
| `stopOnSignals(server)`                                   | Calls `stop` on SIGTERM and SIGINT, and exits with its code                                                 |
| `ProblemError`, `badRequest`, `notFound`, `conflict`, …   | The errors a route throws. The error handler turns each one into an answer in the platform's format         |
| `problemResponses(400, 404, …)`                           | The error answers a route declares, so that the OpenAPI document lists them                                 |
| `listQuery`, `parseSort`, `pageOf`, `pageSchema`, cursors | The query string and the answer of a list: filters, sorting, a limit and a cursor                           |
| `requireScope(request, scope)`, `principalOf(request)`    | Who signed in, and whether they may do this. `bearerToken(request)` reads an `Authorization: Bearer` header |
| `addHealthComponent(app, component)`                      | Adds a part the service depends on to the health route                                                      |
| `openapiDocument(app)`                                    | The OpenAPI document as the committed `openapi.json` holds it                                               |

## Why we have it

Every API of the platform makes the same promises: errors in one format, lists that page the same way, an OpenAPI document, a health route, sign-in on every endpoint that is not public, and a stop that cuts no request in half. The [API rules](../dev/shared/.claude/rules/api.md) list them.

Without this package, every service would write those parts again, and each copy would drift. A client that learned one API would have to learn the next one anew.

## How it works here

`createApi` builds the server in this order:

1. The logger is the one from `@zigordev/otel`, and Fastify writes no line per request.
2. Zod validates every request and serializes every answer. An answer loses any field that its schema does not list, so a column added to a table never leaks by accident.
3. The API accepts JSON only. A body in plain text gets 415.
4. One error handler and one not-found handler write every error as an RFC 9457 problem, with the media type `application/problem+json`.
5. Every request is named by its route pattern, such as `/api/v1/notes/:noteId`, for the traces and the duration metric. A raw path never becomes a label.
6. Every route needs a signed-in caller unless it says `config: { public: true }`. A route that matches nothing answers 404 to everyone.
7. The OpenAPI 3.1 document is at `/api/v1/openapi.json`, and Swagger UI shows it at `/api/v1/docs`. Both are public.
8. `GET /health` answers at the root, outside any prefix.

### The error format

```json
{
  "type": "https://zigordev.com/problems/request-invalid",
  "title": "Bad request",
  "status": 400,
  "detail": "2 fields of the request are invalid. params.errors names each one.",
  "instance": "/api/v1/notes",
  "code": "request.invalid",
  "params": {
    "errors": [
      {
        "in": "body",
        "pointer": "/title",
        "code": "too_small",
        "detail": "Too small: expected string to have >=1 characters"
      },
      {
        "in": "body",
        "pointer": "/colour",
        "code": "unrecognized_key",
        "detail": "colour is not a known field"
      }
    ]
  }
}
```

| Status | Code                             | When                                                                                          |
| ------ | -------------------------------- | --------------------------------------------------------------------------------------------- |
| 400    | `request.invalid`                | A field of the body, the query, the path or the headers is invalid. Every one is listed       |
| 400    | `request.malformed`              | The body is not JSON                                                                          |
| 401    | `auth.unauthenticated`           | No credentials, or credentials nobody knows. The answer asks for `Bearer`                     |
| 403    | `auth.forbidden`                 | The caller lacks the scope. `params.scope` names it                                           |
| 404    | `route.not_found`                | No route matches                                                                              |
| 413    | `request.too_large`              | The body is over the limit, 1 MiB unless the app sets `bodyLimit`                             |
| 415    | `request.unsupported_media_type` | The body is not JSON                                                                          |
| 500    | `server.error`                   | Anything else. The body says nothing of the cause, and the log line `request.failed` holds it |

A feature adds its own codes, named `area.what`, such as `note.not_found`.

### Lists

A list takes its filters as `?field=value`, its order as `sort=field` or `sort=-field`, and pages with `limit` (20 unless asked, 100 at most) and `cursor`. An unknown filter or sort field is a 400, because the query object is strict. The answer is `{ "items": [...], "nextCursor": "..." }`, with no `nextCursor` on the last page.

A cursor is an opaque text that holds the sort values of the last item, and the sort order it belongs to. A cursor used with another order is refused with a 400.

### The stop

`stop(signal)` writes `service.stopping`, and closes the server: it takes no new connection, lets every request in flight finish, and closes each connection as soon as its last answer is sent. Then it sends the last telemetry. It ends with code 0. When the close takes longer than 25 seconds, it writes `service.stop_timed_out` and ends with code 1, before the container's 30 seconds of grace run out.

## How to use it

```ts
import { createApi, notFound, problemResponses, requireScope } from '@zigordev/api';
import { createLogger } from '@zigordev/otel';
import * as z from 'zod';

const logger = createLogger({ service: 'notes-api' });
const app = await createApi({
  service: 'notes-api',
  logger,
  docs: { title: 'Notes API', description: 'Notes, kept in PostgreSQL', version: '1.0.0' },
  authenticate: (request) => verify(request),
});

app.get(
  '/api/v1/notes/:noteId',
  {
    schema: {
      summary: 'Get one note',
      tags: ['notes'],
      operationId: 'getNote',
      params: z.strictObject({ noteId: z.uuid() }),
      response: { 200: note, ...problemResponses(400, 401, 403, 404) },
    },
  },
  async (request) => {
    requireScope(request, 'notes:read');
    const found = await notes.find(request.params.noteId);
    if (found === undefined) {
      throw notFound('note.not_found', 'No note has this id.', { noteId: request.params.noteId });
    }
    return found;
  }
);
await app.ready();
```

`authenticate` receives the request and returns the caller, `{ id, scopes }`, or `undefined`. An app adds fields to `Principal` with TypeScript's declaration merging.

`src/main.ts` of a service starts it, and stops it on a signal:

```ts
import { serve, stopOnSignals } from '@zigordev/api';

stopOnSignals(await serve(app, { port: 3000, host: '0.0.0.0', logger }));
```

The package needs `fastify`, `zod` and `@zigordev/otel` beside it, at the versions the app itself uses.

## How to check that it works

- `pnpm exec vitest run --project api` in `toolkit` runs this package's tests. They build a small API and send it requests: each error, each sign-in case, a walk through every page of a list, the OpenAPI document, the health route, and a stop with a request in flight.
- `curl -i http://<app>.localhost/api/v1/nothing` on a running app answers 404 with `content-type: application/problem+json`.
- A stop that ends with code 137 in `docker compose` means the process was killed after 30 seconds. Look for `service.stop_timed_out` in its last lines: something in the app's `onClose` did not finish.
