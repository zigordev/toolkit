import { type Env, loadConfig } from '@zigordev/config';
import * as z from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default('0.0.0.0'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  OTEL_SERVICE_NAME: z.string().min(1),
  OTEL_SERVICE_VERSION: z.string().min(1).optional(),
});

export type Config = z.output<typeof schema>;

export function readConfig(env: Env = process.env): Config {
  return loadConfig(schema, { env });
}
