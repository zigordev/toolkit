import type * as z from 'zod';
import { ConfigError, type ConfigIssue } from './config-error.ts';

export type Env = Readonly<Record<string, string | undefined>>;

export interface LoadConfigOptions {
  readonly env?: Env;
}

type Input = Readonly<Record<string, string>>;

function readVariables(names: readonly string[], env: Env): Input {
  const input: Record<string, string> = {};
  for (const name of names) {
    const value = env[name];
    if (value !== undefined && value !== '') {
      input[name] = value;
    }
  }
  return input;
}

function describe(issue: z.core.$ZodIssue, input: Input): ConfigIssue {
  if (issue.path.length === 0) {
    return { variable: '(config)', message: issue.message };
  }
  const variable = issue.path.map(String).join('.');
  const missing =
    issue.path.length === 1 && input[variable] === undefined && issue.code !== 'custom';
  return { variable, message: missing ? 'is missing' : issue.message };
}

export function loadConfig<Schema extends z.ZodObject>(
  schema: Schema,
  options: LoadConfigOptions = {}
): Readonly<z.output<Schema>> {
  const input = readVariables(Object.keys(schema.shape), options.env ?? process.env);
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ConfigError(result.error.issues.map((issue) => describe(issue, input)));
  }
  return Object.freeze(result.data);
}
