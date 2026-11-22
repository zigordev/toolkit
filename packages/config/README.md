# @zigordev/config

One function that reads an app's settings from the environment, once, through a Zod schema. When a setting is missing or wrong, the app stops as it starts, and says which ones.

## What it is

An app describes its settings in one place, as a schema. A schema is a description of data that a program can check: here, the name of each environment variable, its type and its rules. Zod is the library the schema is written with.

| Export                         | What it is                                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `loadConfig(schema, options?)` | Reads the variables the schema names, and returns them checked, typed and frozen                      |
| `ConfigError`                  | The error it throws. Its `message` has one line per problem, and its `issues` hold the same as a list |
| `ConfigIssue`                  | The type of one problem: the `variable` and the `message`                                             |
| `Env`, `LoadConfigOptions`     | The types of what `loadConfig` accepts                                                                |

## Why we have it

Every app on the platform promises to read all its settings from environment variables and to check them once, at start. [The platform](../../docs/handbook/the-platform.md) lists that promise with the eleven others. This package keeps it for a TypeScript app.

Without it, three things go wrong:

- Each app writes its own loader, and each one differs a little.
- A missing setting shows late. The app starts, and it fails at the first request that needs the setting, which can be days after the deploy. Checked at start, the new version never becomes healthy, so it never receives traffic.
- Code reads `process.env` wherever it likes, and nobody can say which settings an app needs.

## How it works here

`loadConfig` does five things, in this order:

1. It reads from the environment only the variables that the schema names. It ignores every other variable.
2. It treats an empty variable as one that is not set. A compose file that takes a value from a variable nobody set passes it on empty, and empty text would otherwise pass as the number 0.
3. It checks the values against the schema. The schema also turns text into numbers and booleans and fills in the defaults.
4. When anything is wrong, it throws one `ConfigError` that lists every problem at once, so one failed start shows them all.
5. Otherwise it returns the settings, typed from the schema and frozen, so no code changes them later.

A problem is named by its variable. A variable with no value reads `is missing`, and a wrong value gets the reason that Zod gives:

```text
ConfigError: Invalid configuration:
- PORT: Invalid input: expected number, received NaN
- DATABASE_URL: is missing
- LOG_LEVEL: Invalid option: expected one of "debug"|"info"|"warn"|"error"
```

Neither the message nor `issues` ever holds a value, because Zod's own messages name the rule and not the input. A secret therefore cannot reach a log through this error. A message that a schema's author writes is the author's to keep free of values.

The package does not stop the process itself, and it does not log. The app calls `loadConfig` while it starts and does not catch the error. Node.js then prints the error to its error output and exits with code 1, before the app listens on its port.

Nothing differs between the laptop and production except the values. In both, an app gets its settings as environment variables only, so this package reads no file.

Zod is a peer dependency: the app installs it, and the app and this package share one copy.

## How to use it

Add the package and Zod to the app:

```bash
pnpm add @zigordev/config zod
```

The worked example is the `src/config.ts` of an API. It is the only file of the app that reads the environment:

```ts
import { loadConfig } from '@zigordev/config';
import * as z from 'zod';

export const config = loadConfig(
  z.object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    DATABASE_URL: z.url(),
    SIGNUP_OPEN: z.stringbool().default(true),
  })
);
```

Every other file imports `config`. Here `config.PORT` is a `number` and `config.SIGNUP_OPEN` is a `boolean`, and a misspelt name does not compile.

The environment holds only text, so the schema says how to read each value:

| The setting is          | Write                                       | Why                                                                                                            |
| ----------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| A number                | `z.coerce.number()`, with its limits        | It turns the text into a number, and text that is no number fails                                              |
| True or false           | `z.stringbool()`                            | It reads `true`, `false`, `1`, `0`, `yes` and `no`. `z.coerce.boolean()` reads every text as true, `false` too |
| One of a few words      | `z.enum([...])`                             | Any other word fails, and the message lists the words                                                          |
| Not required            | `.optional()`, or `.default(...)`           | Without one of them the variable is required                                                                   |
| Tied to another setting | `.refine(...)` on the object, with a `path` | The problem is then named by the variable the `path` gives                                                     |

A test passes the values in and leaves `process.env` alone:

```ts
const config = loadConfig(schema, {
  env: { PORT: '8080', DATABASE_URL: 'postgres://db:5432/app' },
});
```

## How to check that it works

| Try this                                                 | What must happen                                                                       |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Start the app with a required variable not set           | It exits with code 1 before it listens, and its error output has `- NAME: is missing`  |
| Start it with a wrong value, such as `PORT=eighty`       | It exits with code 1. The line names `PORT` and the reason, and the value is not shown |
| Start it with two wrong values                           | Both are listed in the one error                                                       |
| Start it with an empty value for a variable with default | It starts, and the setting has its default                                             |
| Read `config.PORT` in the editor                         | Its type is `number`                                                                   |

When the error says a variable is missing and you did set it, the value is empty or the variable never reached the app. A container gets only the variables that its compose file names.

When a wrong value gets through, the schema is too loose for it. Give a number its limits, and read true and false with `z.stringbool()`.

When a problem reads `(config)` in place of a variable, a rule on the whole schema failed and has no `path`. Add one, so the line names the variable to fix.
