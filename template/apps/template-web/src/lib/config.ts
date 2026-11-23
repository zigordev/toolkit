import { type Env, loadConfig } from '@zigordev/config';
import * as z from 'zod';

const schema = z.object({
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  OTEL_SERVICE_NAME: z.string().min(1),
  OTEL_SERVICE_VERSION: z.string().min(1).optional(),
  API_URL: z.url(),
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
