# @zigordev/otel

Telemetry for a service, the same in every one: traces and metrics through OpenTelemetry, log lines that carry the trace, and the answer of the health route.

## What it is

Telemetry is what a running app reports about itself. It comes in three kinds:

| Kind     | What it is                                                                      | Example                                   |
| -------- | ------------------------------------------------------------------------------- | ----------------------------------------- |
| Trace    | The journey of one request, as timed steps. One step is called a span           | A request, its database query, its call   |
| Metric   | A number that is counted or measured over time                                  | Requests by route, and how long they took |
| Log line | One thing that happened, written as one line of JSON, the usual format for data | `pool.created`                            |

OpenTelemetry is the open standard for traces and metrics, and the library that records them. pino is the logger that writes the JSON lines. This package sets both up one way, so a service does not.

| Export                                             | What it does                                                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `@zigordev/otel/register`                          | Captures the output and starts telemetry when Node.js loads it with `--import`, before the app's own code |
| `startTelemetry(options?)`                         | The same start, for an app that adds an instrumentation of its own                                        |
| `shutdownTelemetry()`                              | Sends what the service still holds, then stops. A service calls it before it exits                        |
| `createLogger(options)`                            | The logger: one JSON line per event, on standard output                                                   |
| `logStarted`, `logStopping`, `logProcessCrashes`   | The standard events that every service writes                                                             |
| `captureOutput(logger?)`                           | Turns what `console` prints, and what Node.js warns of, into JSON lines. The register entry calls it      |
| `checkHealth(options)`                             | Works out the answer of `GET /health` from the parts the service depends on                               |
| `createCounterAtZero(meter, name, options, known)` | A counter whose known series all start at 0                                                               |
| `nameRoute(route)`                                 | Tells telemetry which route the request in progress matched, such as `/api/v1/pools/:poolId`              |
| `isProbeRequest(url)`                              | Says whether a path is a probe, which leaves no trace                                                     |
| `isUntracedRequest(url)`                           | Says whether a path leaves no trace: a probe, or a live-update stream from `streamPaths`                  |

An instrumentation is code that records telemetry for a library, such as the database driver, without the app writing any. A probe is a request that only asks whether the app is alive.

## Why we have it

Every app on the platform promises four things that this package keeps for a TypeScript service. [The platform](../../docs/handbook/the-platform.md) lists them as promises 3 to 6: answer `GET /health`, write logs as JSON lines with no personal data, send traces and metrics under its own name, and stop cleanly.

Without the package, three things go wrong:

- Each service wires OpenTelemetry its own way, and the names differ. One dashboard and one set of alerts cover every app only because every app reports under the same names.
- The rules that keep telemetry worth reading live in a document, and a service forgets one. Here they are code: nothing personal, no trace for a probe, no trace for background work.
- A service loses its last seconds of telemetry at every stop, because nothing sends them before it exits.

## How it works here

### The start

Telemetry starts before the app's own code:

```bash
node --import @zigordev/otel/register src/main.ts
```

The order matters. The instrumentations wrap a module at the moment Node.js loads it, so they have to be in place first. For that the start installs loader hooks, which are functions that Node.js calls for each module it loads. It takes them from the copy of `import-in-the-middle` that OpenTelemetry's own instrumentation uses, so one process never holds two.

From then on a service records, by itself:

| What                                               | As                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| Each request that comes in                         | A span, and the metric `http.server.request.duration`            |
| Each request it makes, with `fetch` or `node:http` | A span, and the metric `http.client.request.duration`            |
| Each PostgreSQL query                              | A span, and the numbers of the connection pool                   |
| The Node.js runtime                                | Metrics of the event loop, the memory and the garbage collection |

A span and a duration are worth little under the raw path, because every id makes a path of its own. The app's web framework knows the pattern that a request matched, and passes it on with `nameRoute`. The span is then named `GET /api/v1/pools/:poolId`, and the duration metric carries the pattern as `http.route`.

It sends them over OTLP, the protocol of OpenTelemetry, to the telemetry agent: spans every 5 seconds and metrics every 60. Logs never travel that way. The agent reads them from the container's output.

The start reads the standard variables of OpenTelemetry:

| Variable                      | Holds                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `OTEL_SERVICE_NAME`           | The app's one name, `<product>-<part>`, such as `gpool-api`                                     |
| `OTEL_SERVICE_VERSION`        | The version that is running. It becomes `service.version`, and `version` in the health answer   |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | The agent's address. `http://localhost:4318` when it is not set                                 |
| `OTEL_RESOURCE_ATTRIBUTES`    | More facts about the service, such as `deployment.environment.name=production`                  |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `http/json` sends JSON, which a person can read. Anything else sends protobuf, a compact format |
| `OTEL_SDK_DISABLED`           | `true` switches telemetry off, for a unit test                                                  |
| `OTEL_EXPORTER_OTLP_TIMEOUT`  | How long one send may take, in milliseconds. 10000 when it is not set                           |
| `OTEL_LOG_LEVEL`              | How much OpenTelemetry says about itself. Warnings and errors when it is not set                |

Nothing differs between the laptop and production. A service sends to the agent in both, and only the agent knows where the data goes next.

Every span and every metric says who sent it, and nothing more. The start names the service, its version and one id for each running copy, the process by its id and the Node.js version that runs it, and the operating system with its version. It sends nothing that names the machine or the person who runs it: no host name, no machine id, no user, no command and no path. On a laptop each of those can hold a person's name, as a computer's name or a home folder often does. `OTEL_NODE_RESOURCE_DETECTORS` is not read, so these facts are the same everywhere.

### The rules it keeps

- **A probe leaves no trace.** A request to `/health`, `/favicon.ico` or `/_next/static/` gets no span, whichever part of the app would start one.
- **A live-update stream leaves no trace.** A request to `/api/v1/live` stays open for as long as its page does, so a span or a request duration would measure the visit, not the work, and would make the API look slow. It gets no span and no count in `http.server.request.duration`. `@zigordev/live` counts the streams instead.
- **Background work starts no trace.** A query or an outgoing request gets a span only inside another span, so a timer that polls does not fill the store. A background task that is worth a trace starts its own span.
- **Every trace is kept.** Nothing is sampled, so `OTEL_TRACES_SAMPLER` is not read.
- **Nothing identifies a visitor.** Before a span leaves the service, it loses the visitor's address, the user agent and the query string. A web address keeps only what comes before its `?`.
- **Nothing names the machine or its user.** The facts that go with every span and metric name no host, user, command or path.
- **Starting twice does nothing.** The second call returns the first one's handle.
- **A stop never fails over telemetry.** `shutdownTelemetry()` sends what the service still holds. When the agent cannot be reached, it waits until the send gives up, says so in a line at the level `warn`, and returns as usual.
- **Every line is a JSON line.** What a library prints with `console`, what OpenTelemetry says about itself and what Node.js warns of all become lines of the same shape as the service's own.

The attributes a span loses are `client.address`, `client.port`, `network.peer.address`, `network.peer.port`, `url.query` and `user_agent.original`, and their older names. `url.full`, `http.url` and `http.target` are cut at the query.

### Logs

Each line is one JSON object on standard output:

| Field       | Present                                               | Holds                                           |
| ----------- | ----------------------------------------------------- | ----------------------------------------------- |
| `timestamp` | Always                                                | The time in UTC, as ISO 8601                    |
| `level`     | Always                                                | `debug`, `info`, `warn` or `error`              |
| `service`   | Always                                                | The app's name, the same as `OTEL_SERVICE_NAME` |
| `release`   | When it is given                                      | The version, the same as `OTEL_SERVICE_VERSION` |
| `event`     | On an event line                                      | The event's name                                |
| `message`   | On a message line                                     | Free text                                       |
| `traceId`   | Inside a request                                      | The trace this line belongs to                  |
| `spanId`    | Inside a request                                      | The step of that trace                          |
| `error`     | On a failure                                          | The error's `name`, `message` and `stack`       |
| `source`    | On a line that the service's own logger did not write | `console` or `opentelemetry`                    |

Any other field that the code passes sits at the top level, beside these.

A field named `password`, `token`, `secret`, `authorization` or `cookie` is written as `[redacted]`, at the top level and one level down. It is a last defence: a secret or personal data does not belong in a log line at all.

A level means the same in every service:

| Level   | Means                                                           |
| ------- | --------------------------------------------------------------- |
| `error` | Something failed that a person should look at                   |
| `warn`  | Something went wrong and the app handled it: a retry, a refusal |
| `info`  | The service's life and its business events                      |
| `debug` | Detail for a run on the laptop. Production filters it out       |

An event is named `area.what_happened`, in lower case, such as `pool.created`. Dashboards and alerts search for these names, so a name never changes its meaning, and a new outcome gets a new name. Three functions write the events that every service has:

| Function            | Event                                                       | When                                              |
| ------------------- | ----------------------------------------------------------- | ------------------------------------------------- |
| `logStarted`        | `service.started`                                           | Once, when the service is ready                   |
| `logStopping`       | `service.stopping`                                          | On the signal that asks it to stop                |
| `logProcessCrashes` | `process.uncaught_exception`, `process.unhandled_rejection` | Before the process dies of an error nobody caught |

The register entry writes one more by itself, `process.warning`, whenever Node.js warns.

`logProcessCrashes` only watches. Node.js still ends the process, as it would without it.

### What a library prints

A library does not know the service's logger. Next.js prints a few lines as it starts, OpenTelemetry reports its own failures, and Node.js warns of a function that is going away. Left alone, each of them is plain text, and the agent cannot tell its level.

The register entry therefore captures the output before any other code runs. Each of these becomes one JSON line on standard output, with the service's name and version, and with the trace when it is printed inside a request:

| What writes                                  | The line it becomes                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `console.log`, `console.info`, `console.dir` | `info`, with `"source":"console"` and the text as `message`                                             |
| `console.debug`, `console.trace`             | `debug`. A trace keeps the stack of its caller                                                          |
| `console.warn`                               | `warn`                                                                                                  |
| `console.error`                              | `error`. An error that is printed keeps its stack, inside `message`                                     |
| A warning of Node.js                         | `warn`, with the event `process.warning`, the warning as `error`, and its `code` when it has one        |
| OpenTelemetry about itself                   | `warn` or `error`, with `"source":"opentelemetry"`. A failure to send comes with the failure as `error` |

The other `console` methods, such as `console.table` and `console.assert`, are built on these, so they are caught too.

A line of the service's own logger has no `source`. Searching the logs for `source="console"` therefore shows what libraries print, and any call to `console` that was left in our own code.

Two things can still be plain text:

- **A crash.** Node.js prints the error itself when the process dies of one that nobody caught, after the `process.uncaught_exception` line.
- **OpenTelemetry while it starts**, before its logger is in place. At the usual level it writes then only to complain about a setting, such as an unknown name in `OTEL_PROPAGATORS`. With `OTEL_LOG_LEVEL=debug`, its first lines are plain text.

### Health

`checkHealth` asks each part the service depends on, and answers for the whole:

| Answer     | Code | Means                                                        |
| ---------- | ---- | ------------------------------------------------------------ |
| `ok`       | 200  | Every part is up                                             |
| `degraded` | 200  | A part that is not required is down. The service still works |
| `error`    | 503  | A required part is down. The service cannot do its job       |

A part reports `up`, `down` or `unknown`. `unknown` means nothing has tried it yet, and it does not count as failing. A check that throws, or that takes longer than 800 ms, counts as `down`, so the route answers in under a second.

The answer also names the version that runs, from `OTEL_SERVICE_VERSION`: in production the full commit, the same as the image's tag. The deploy asks the product's `/health` from outside after each deploy, and rolls back when the version is not the one it sent. Without the variable the version is `unknown`.

```json
{
  "status": "ok",
  "service": "gpool-api",
  "version": "1f3a9c2e8b7d6a5f4e3d2c1b0a9f8e7d6c5b4a39",
  "components": { "db": { "status": "up" } }
}
```

### Counters

A counter that is created at its first event starts at 1, and a dashboard then misses that first event. `createCounterAtZero` creates every series it is told about at 0, when the service starts.

## How to use it

Add the package, and the OpenTelemetry API that it shares with the app:

```bash
pnpm add @zigordev/otel @opentelemetry/api
```

pnpm stops an install when a dependency brings an install script that nobody has decided about. One comes with OpenTelemetry, in `protobufjs`, and nothing here needs it. Refuse it in the repo's `pnpm-workspace.yaml`:

```yaml
allowBuilds:
  protobufjs: false
```

The worked example is the whole `src/main.ts` of a small service. Its settings come from [`@zigordev/config`](../config/README.md):

```ts
import { createServer } from 'node:http';
import {
  checkHealth,
  createLogger,
  logProcessCrashes,
  logStarted,
  logStopping,
  shutdownTelemetry,
} from '@zigordev/otel';
import { config } from './config.ts';

const logger = createLogger({
  service: config.OTEL_SERVICE_NAME,
  release: config.OTEL_SERVICE_VERSION,
  level: config.LOG_LEVEL,
});
logProcessCrashes(logger);

const server = createServer(async (request, response) => {
  if (request.url === '/health') {
    const report = await checkHealth({ service: config.OTEL_SERVICE_NAME, components: [] });
    response.writeHead(report.statusCode, { 'content-type': 'application/json' });
    response.end(JSON.stringify(report.body));
    return;
  }
  logger.info({ event: 'greeting.sent' });
  response.end('hello');
});

server.listen(config.PORT, () => logStarted(logger, { port: config.PORT }));

process.once('SIGTERM', () => {
  logStopping(logger, 'SIGTERM');
  server.close(async () => {
    await shutdownTelemetry();
    process.exit(0);
  });
});
```

Start it with `node --import @zigordev/otel/register src/main.ts`. A request to `/` then leaves one span, one count in `http.server.request.duration` and one log line that carries the span's trace. A request to `/health` leaves none of the three.

A dependency becomes a part of the health answer. `required` says whether the service can work without it:

```ts
const report = await checkHealth({
  service: config.OTEL_SERVICE_NAME,
  components: [{ name: 'db', required: true, check: pingDatabase }],
});
```

A number of the business is a counter. Give it every value its attributes can take:

```ts
import { metrics } from '@opentelemetry/api';
import { createCounterAtZero } from '@zigordev/otel';

const actions = createCounterAtZero(
  metrics.getMeter('gpool-api'),
  'gpool.pool.actions',
  { description: 'Pool actions' },
  [{ action: 'create' }, { action: 'join' }]
);

actions.add(1, { action: 'join' });
```

An attribute holds a value from a short, fixed list: an outcome or a route pattern, never an id, an address or a raw path.

A web framework names the route once it has matched the request. In Fastify that is one hook:

```ts
import { nameRoute } from '@zigordev/otel';

app.addHook('onRequest', async (request) => {
  const route = request.routeOptions.url;
  if (route !== undefined) {
    nameRoute(route);
  }
});
```

A request that matches no route gets no name. Its raw path would be a new value each time, and a metric must not carry one.

An app that needs one more instrumentation writes its own start file, and loads that file with `--import` in place of the register entry:

```ts
import { startTelemetry } from '@zigordev/otel';

startTelemetry({ instrumentations: [frameworkInstrumentation] });
```

## How to check that it works

| Try this                                             | What must happen                                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Start the service and read its output                | The first line is JSON and has `"event":"service.started"`                         |
| Print with `console.log` anywhere in the service     | One JSON line with `"source":"console"` appears, and nothing on the error output   |
| Call a route, then search for the service in Grafana | A trace shows the request as a span, with its queries and calls beneath it         |
| Log inside a request                                 | The line has a `traceId`, and searching for that id finds the trace                |
| Call `/health`                                       | It answers 200 with `"status":"ok"`, and no trace appears                          |
| Call a route with `?email=ada@example.com`           | The span has the path, and neither the address nor the user agent nor the email    |
| Send the service a SIGTERM                           | It writes `service.stopping`, exits with code 0, and its last spans still arrive   |
| Make a required part fail, then call `/health`       | It answers 503 with `"status":"error"`, and the body names the part that is `down` |

The package's own test does the first seven in a real process, against a stand-in for the agent:

```bash
pnpm exec vitest run packages/otel/src/telemetry.e2e.test.ts
```

When no telemetry arrives, the service cannot reach the agent, and OpenTelemetry says so in lines at the level `error`, with `"source":"opentelemetry"`. Check `OTEL_EXPORTER_OTLP_ENDPOINT`, and that `OTEL_SDK_DISABLED` is not set.

When a stop takes about ten seconds, the agent cannot be reached either, and the last send waits until it gives up. The service still exits with code 0. A smaller `OTEL_EXPORTER_OTLP_TIMEOUT` shortens the wait.

When requests leave no span at all, the service started without `--import`, so the instrumentations came too late.

When a query is missing from a trace, it ran outside a request. Background work starts no trace unless it starts a span of its own.

When every request of a service shows as plain `GET` or `POST`, nothing names the route. Call `nameRoute` from the framework, as shown above.

When a log line has no `traceId`, it was written outside a request, or inside a probe.

When telemetry arrives under a name that starts with `unknown_service`, `OTEL_SERVICE_NAME` is not set.

When a dashboard misses the first event after a start, the counter was created at that event. Create it with `createCounterAtZero`.
