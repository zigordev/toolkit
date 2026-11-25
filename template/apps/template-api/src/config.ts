import { fileURLToPath } from 'node:url';
import { type AuthConfig, type AuthMethod, authConfigShape } from '@zigordev/auth';
import { type Env, loadConfig } from '@zigordev/config';
import { flagsSettings } from '@zigordev/flags';
import * as z from 'zod';
import { apiKeysSchema } from './plugins/api-keys.ts';

const service = {
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  OTEL_SERVICE_NAME: z.string().min(1),
  OTEL_SERVICE_VERSION: z.string().min(1).optional(),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
};

const auth = authConfigShape(['email', 'passkey']);

const signIn = {
  AUTH_SECRET: auth.AUTH_SECRET.optional(),
  AUTH_URL: auth.AUTH_URL.optional(),
  AUTH_GOOGLE_CLIENT_ID: auth.AUTH_GOOGLE_CLIENT_ID,
  AUTH_GOOGLE_CLIENT_SECRET: auth.AUTH_GOOGLE_CLIENT_SECRET,
  AUTH_GOOGLE_STAND_IN_URL: auth.AUTH_GOOGLE_STAND_IN_URL,
  AUTH_EMAIL_HOLD: z.stringbool().default(false),
};

interface SignInSettings {
  readonly AUTH_SECRET?: string | undefined;
  readonly AUTH_URL?: string | undefined;
  readonly AUTH_GOOGLE_CLIENT_ID?: string | undefined;
  readonly AUTH_GOOGLE_CLIENT_SECRET?: string | undefined;
  readonly AUTH_EMAIL_HOLD: boolean;
}

function checkSignIn(settings: SignInSettings, context: z.core.$RefinementCtx): void {
  const issue = (variable: string, message: string) =>
    context.addIssue({ code: 'custom', path: [variable], message });
  const on = settings.AUTH_SECRET !== undefined || settings.AUTH_URL !== undefined;
  if (on && settings.AUTH_SECRET === undefined) {
    issue('AUTH_SECRET', 'is needed with AUTH_URL, to turn sign-in on');
  }
  if (on && settings.AUTH_URL === undefined) {
    issue('AUTH_URL', 'is needed with AUTH_SECRET, to turn sign-in on');
  }
  if (
    settings.AUTH_GOOGLE_CLIENT_ID !== undefined &&
    settings.AUTH_GOOGLE_CLIENT_SECRET === undefined
  ) {
    issue('AUTH_GOOGLE_CLIENT_SECRET', 'is needed with AUTH_GOOGLE_CLIENT_ID');
  }
  if (
    settings.AUTH_GOOGLE_CLIENT_SECRET !== undefined &&
    settings.AUTH_GOOGLE_CLIENT_ID === undefined
  ) {
    issue('AUTH_GOOGLE_CLIENT_ID', 'is needed with AUTH_GOOGLE_CLIENT_SECRET');
  }
  if (on && !settings.AUTH_EMAIL_HOLD) {
    issue(
      'AUTH_EMAIL_HOLD',
      'has to be true while sign-in emails cannot reach the notifications service'
    );
  }
  if (settings.AUTH_EMAIL_HOLD && settings.AUTH_URL?.startsWith('https:') === true) {
    issue('AUTH_EMAIL_HOLD', 'holds emails only on the laptop, over http, never in production');
  }
}

const schema = z
  .object({
    ...service,
    ...signIn,
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    HOST: z.string().min(1).default('0.0.0.0'),
    FLAGS_FILE: flagsSettings.FLAGS_FILE.default(
      fileURLToPath(new URL('../flags.json', import.meta.url))
    ),
    API_KEYS: z
      .string()
      .default('[]')
      .transform((text, context) => {
        try {
          return JSON.parse(text) as unknown;
        } catch {
          context.addIssue({ code: 'custom', message: 'is not JSON' });
          return z.NEVER;
        }
      })
      .pipe(apiKeysSchema),
  })
  .superRefine(checkSignIn);

const migrateSchema = z.object({
  ...service,
  DATABASE_ADMIN_URL: z.url({ protocol: /^postgres(ql)?$/ }).optional(),
});

export type Config = z.output<typeof schema>;

export interface SignIn {
  readonly config: AuthConfig;
  readonly methods: readonly AuthMethod[];
}

export function signInOf(config: Config): SignIn | undefined {
  if (config.AUTH_SECRET === undefined || config.AUTH_URL === undefined) {
    return undefined;
  }
  const google =
    config.AUTH_GOOGLE_CLIENT_ID !== undefined && config.AUTH_GOOGLE_CLIENT_SECRET !== undefined;
  return {
    methods: google ? ['email', 'passkey', 'google'] : ['email', 'passkey'],
    config: {
      AUTH_SECRET: config.AUTH_SECRET,
      AUTH_URL: config.AUTH_URL,
      AUTH_GOOGLE_CLIENT_ID: config.AUTH_GOOGLE_CLIENT_ID,
      AUTH_GOOGLE_CLIENT_SECRET: config.AUTH_GOOGLE_CLIENT_SECRET,
      AUTH_GOOGLE_STAND_IN_URL: config.AUTH_GOOGLE_STAND_IN_URL,
    },
  };
}
export type MigrateConfig = z.output<typeof migrateSchema>;

export function readConfig(env: Env = process.env): Config {
  return loadConfig(schema, { env });
}

export function readMigrateConfig(env: Env = process.env): MigrateConfig {
  return loadConfig(migrateSchema, { env });
}
