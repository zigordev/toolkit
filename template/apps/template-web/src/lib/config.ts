import { type Env, loadConfig } from '@zigordev/config';
import * as z from 'zod';

const schema = z.object({
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  OTEL_SERVICE_NAME: z.string().min(1),
  OTEL_SERVICE_VERSION: z.string().min(1).optional(),
  API_URL: z.url(),
  RUM_URL: z
    .string()
    .regex(/^\/(?!\/)/, "must be a path on the app's own address, such as /rum")
    .optional(),
  OTEL_RESOURCE_ATTRIBUTES: z.string().optional(),
});

export type Config = z.output<typeof schema>;

let cached: Config | undefined;

export function readConfig(env: Env = process.env): Config {
  return loadConfig(schema, { env });
}

export function getConfig(): Config {
  cached ??= readConfig();
  return cached;
}

export function environmentOf(attributes: string | undefined): string | undefined {
  const value = attributes
    ?.split(',')
    .map((pair) => pair.split('='))
    .find(([key]) => key?.trim() === 'deployment.environment.name')?.[1]
    ?.trim();
  return value === undefined || value === '' ? undefined : value;
}
