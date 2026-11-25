import { fileURLToPath } from 'node:url';
import { type AuthConfig, type AuthMethod, authConfigShape } from '@zigordev/auth';
import { type Env, loadConfig } from '@zigordev/config';
import { type KafkaConnection, kafkaSettings } from '@zigordev/events';
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
};

const kafka = {
  KAFKA_BROKERS: kafkaSettings.KAFKA_BROKERS.optional(),
  KAFKA_USERNAME: kafkaSettings.KAFKA_USERNAME.optional(),
  KAFKA_PASSWORD: kafkaSettings.KAFKA_PASSWORD.optional(),
};

const kafkaVariables = ['KAFKA_BROKERS', 'KAFKA_USERNAME', 'KAFKA_PASSWORD'] as const;

interface Settings {
  readonly AUTH_SECRET?: string | undefined;
  readonly AUTH_URL?: string | undefined;
  readonly AUTH_GOOGLE_CLIENT_ID?: string | undefined;
  readonly AUTH_GOOGLE_CLIENT_SECRET?: string | undefined;
  readonly KAFKA_BROKERS?: readonly string[] | undefined;
  readonly KAFKA_USERNAME?: string | undefined;
  readonly KAFKA_PASSWORD?: string | undefined;
}

type Issue = (variable: string, message: string) => void;

function checkKafka(settings: Settings, signIn: boolean, issue: Issue): void {
  const given = kafkaVariables.filter((variable) => settings[variable] !== undefined);
  for (const variable of kafkaVariables) {
    if (settings[variable] !== undefined) {
      continue;
    }
    if (given.length > 0) {
      issue(variable, `is needed with ${given.join(' and ')}, to reach Kafka`);
    } else if (signIn) {
      issue(variable, 'is needed with sign-in, so that its emails reach the notifications service');
    }
  }
}

function checkSettings(settings: Settings, context: z.core.$RefinementCtx): void {
  const issue: Issue = (variable, message) =>
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
  checkKafka(settings, on, issue);
}

const schema = z
  .object({
    ...service,
    ...signIn,
    ...kafka,
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
  .superRefine(checkSettings);

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

export function kafkaOf(config: Config): KafkaConnection | undefined {
  if (
    config.KAFKA_BROKERS === undefined ||
    config.KAFKA_USERNAME === undefined ||
    config.KAFKA_PASSWORD === undefined
  ) {
    return undefined;
  }
  return {
    clientId: config.OTEL_SERVICE_NAME,
    brokers: config.KAFKA_BROKERS,
    username: config.KAFKA_USERNAME,
    password: config.KAFKA_PASSWORD,
  };
}

export type MigrateConfig = z.output<typeof migrateSchema>;

export function readConfig(env: Env = process.env): Config {
  return loadConfig(schema, { env });
}

export function readMigrateConfig(env: Env = process.env): MigrateConfig {
  return loadConfig(migrateSchema, { env });
}
