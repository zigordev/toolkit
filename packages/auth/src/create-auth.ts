import { passkey } from '@better-auth/passkey';
import { type Meter, metrics } from '@opentelemetry/api';
import type { Logger } from '@zigordev/otel';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { twoFactor } from 'better-auth/plugins';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { createBackgroundTasks } from './background.ts';
import type { AuthConfig, AuthMethod } from './config.ts';
import { authTables } from './drizzle.ts';
import {
  type AuthEmail,
  type AuthEmailSender,
  accountExistsIdempotencyKey,
  passwordEmailKinds,
  tokenIdempotencyKey,
} from './emails.ts';
import { authEventHooks } from './events.ts';
import { googleStandIn } from './google.ts';
import { libraryLogger } from './library-logger.ts';
import { type AuthSession, parseSession } from './session.ts';
import { createAuthTelemetry } from './telemetry.ts';

export const authBasePath = '/api/auth';

export const passwordLength = { min: 15, max: 128 } as const;

export const sessionLifetime = {
  expiresInSeconds: 7 * 24 * 60 * 60,
  renewAfterSeconds: 24 * 60 * 60,
  freshForSeconds: 24 * 60 * 60,
} as const;

export const linkLifetimeSeconds = 60 * 60;

export const trustedDeviceSeconds = 30 * 24 * 60 * 60;

export interface CreateAuthOptions<TSchema extends Record<string, unknown>> {
  readonly appName: string;
  readonly displayName?: string;
  readonly config: AuthConfig;
  readonly methods: readonly AuthMethod[];
  readonly db: NodePgDatabase<TSchema>;
  readonly logger: Logger;
  readonly sendEmail: AuthEmailSender;
  readonly accountDeletion?: boolean;
  readonly twoFactor?: boolean;
  readonly deleteUserData?: (userId: string) => Promise<void>;
  readonly meter?: Meter;
}

export interface Authentication {
  readonly session: AuthSession | null;
  readonly setCookie: readonly string[];
}

const appNamePattern = /^[a-z][a-z0-9-]*$/;

export function routeOf(url: string): string {
  const path = new URL(url).pathname.slice(authBasePath.length) || '/';
  return path
    .split('/')
    .map((segment) => (segment.length >= 16 ? ':token' : segment))
    .join('/');
}

function requireValue(value: string | undefined, name: string): string {
  if (value === undefined || value === '') {
    throw new Error(`Google sign-in is enabled, so the configuration needs ${name}`);
  }
  return value;
}

function buildAuth<TSchema extends Record<string, unknown>>(options: CreateAuthOptions<TSchema>) {
  const { appName, config, methods, db, logger, sendEmail } = options;
  if (!appNamePattern.test(appName)) {
    throw new Error(`appName must be lower case letters, digits and hyphens: ${appName}`);
  }
  if (methods.length === 0) {
    throw new Error('createAuth needs at least one sign-in method');
  }
  const email = methods.includes('email');
  const google = methods.includes('google');
  const passkeys = methods.includes('passkey');
  if (passkeys && !email && !google) {
    throw new Error(
      'Passkeys sign in to existing accounts, so createAuth also needs email or google'
    );
  }
  const appUrl = new URL(config.AUTH_URL);
  const deletion = options.accountDeletion ?? true;
  const tasks = createBackgroundTasks();
  const telemetry = createAuthTelemetry({
    logger,
    meter: options.meter ?? metrics.getMeter('@zigordev/auth'),
    methods,
    emailKinds: [
      ...(email ? passwordEmailKinds : []),
      ...(deletion ? (['delete-account'] as const) : []),
    ],
    deletions: deletion,
  });
  const events = authEventHooks({
    telemetry,
    methods,
    baseUrl: config.AUTH_URL,
    cookiePrefix: appName,
  });
  const secondFactor = email && (options.twoFactor ?? true);

  async function deliver(message: AuthEmail): Promise<void> {
    try {
      await sendEmail(message);
      telemetry.emailSent(message.kind);
    } catch (error) {
      telemetry.emailFailed(message.kind, error);
    }
  }

  const googleCredentials = google
    ? {
        clientId: requireValue(config.AUTH_GOOGLE_CLIENT_ID, 'AUTH_GOOGLE_CLIENT_ID'),
        clientSecret: requireValue(config.AUTH_GOOGLE_CLIENT_SECRET, 'AUTH_GOOGLE_CLIENT_SECRET'),
      }
    : undefined;
  const standInUrl = google ? config.AUTH_GOOGLE_STAND_IN_URL : undefined;
  if (standInUrl !== undefined) {
    logger.warn({ event: 'auth.google_stand_in_enabled', standInUrl });
  }

  const instance = betterAuth({
    appName,
    baseURL: config.AUTH_URL,
    basePath: authBasePath,
    secret: config.AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: authTables,
      usePlural: true,
      transaction: true,
    }),
    telemetry: { enabled: false },
    logger: libraryLogger(logger),
    emailAndPassword: email
      ? {
          enabled: true,
          requireEmailVerification: true,
          minPasswordLength: passwordLength.min,
          maxPasswordLength: passwordLength.max,
          resetPasswordTokenExpiresIn: linkLifetimeSeconds,
          revokeSessionsOnPasswordReset: true,
          sendResetPassword: ({ user, url, token }, request) =>
            deliver({
              kind: 'reset-password',
              to: user.email,
              name: user.name,
              url,
              idempotencyKey: tokenIdempotencyKey('reset-password', token),
              request,
            }),
          onExistingUserSignUp: ({ user }, request) =>
            deliver({
              kind: 'account-exists',
              to: user.email,
              name: user.name,
              idempotencyKey: accountExistsIdempotencyKey(user.id),
              request,
            }),
          onPasswordReset: async ({ user }) => {
            telemetry.passwordReset(user.id);
          },
        }
      : { enabled: false },
    ...(email
      ? {
          emailVerification: {
            sendOnSignUp: true,
            sendOnSignIn: true,
            autoSignInAfterVerification: true,
            expiresIn: linkLifetimeSeconds,
            sendVerificationEmail: ({ user, url, token }, request) =>
              deliver({
                kind: 'verify-email',
                to: user.email,
                name: user.name,
                url,
                idempotencyKey: tokenIdempotencyKey('verify-email', token),
                request,
              }),
            afterEmailVerification: async (user) => {
              telemetry.emailVerified(user.id);
            },
          },
        }
      : {}),
    socialProviders:
      googleCredentials === undefined
        ? {}
        : { google: { ...googleCredentials, prompt: 'select_account' } },
    user: {
      deleteUser: {
        enabled: deletion,
        deleteTokenExpiresIn: linkLifetimeSeconds,
        sendDeleteAccountVerification: ({ user, url, token }, request) =>
          deliver({
            kind: 'delete-account',
            to: user.email,
            name: user.name,
            url,
            idempotencyKey: tokenIdempotencyKey('delete-account', token),
            request,
          }),
        beforeDelete: async (user) => {
          try {
            await options.deleteUserData?.(user.id);
          } catch (error) {
            telemetry.accountDeletionFailed(user.id, error);
            throw error;
          }
        },
        afterDelete: async (user) => {
          telemetry.accountDeleted(user.id);
        },
      },
    },
    account: {
      accountLinking: { enabled: true, requireLocalEmailVerified: true },
      encryptOAuthTokens: true,
    },
    session: {
      expiresIn: sessionLifetime.expiresInSeconds,
      updateAge: sessionLifetime.renewAfterSeconds,
      freshAge: sessionLifetime.freshForSeconds,
      cookieCache: { enabled: false },
    },
    verification: { storeIdentifier: 'hashed' },
    rateLimit: {
      enabled: true,
      storage: 'database',
      customRules: { '/get-session': false },
    },
    advanced: {
      cookiePrefix: appName,
      database: { generateId: 'uuid' },
      disableOriginCheck: false,
      ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
      backgroundTasks: { handler: (task) => tasks.run(task) },
    },
    databaseHooks: events.databaseHooks,
    plugins: [
      ...(passkeys
        ? [
            passkey({
              rpID: appUrl.hostname,
              rpName: options.displayName ?? appName,
              origin: appUrl.origin,
              authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
            }),
          ]
        : []),
      ...(secondFactor
        ? [
            twoFactor({
              issuer: options.displayName ?? appName,
              backupCodeOptions: { amount: 10, length: 10 },
              trustDeviceMaxAge: trustedDeviceSeconds,
              accountLockout: { enabled: true, maxFailedAttempts: 10, durationSeconds: 15 * 60 },
            }),
          ]
        : []),
      ...(standInUrl === undefined || googleCredentials === undefined
        ? []
        : [googleStandIn({ url: standInUrl, ...googleCredentials })]),
      events.plugin,
    ],
  });

  return { instance, tasks, telemetry };
}

export type BetterAuthInstance = ReturnType<typeof buildAuth>['instance'];

export interface AppAuth {
  readonly appName: string;
  readonly basePath: string;
  readonly baseUrl: string;
  readonly methods: readonly AuthMethod[];
  readonly betterAuth: BetterAuthInstance;
  handler(request: Request): Promise<Response>;
  getSession(headers: Headers): Promise<AuthSession | null>;
  authenticate(headers: Headers): Promise<Authentication>;
  settle(): Promise<void>;
}

export function createAuth<TSchema extends Record<string, unknown>>(
  options: CreateAuthOptions<TSchema>
): AppAuth {
  const { instance, tasks, telemetry } = buildAuth(options);
  return {
    appName: options.appName,
    basePath: authBasePath,
    baseUrl: options.config.AUTH_URL,
    methods: options.methods,
    betterAuth: instance,
    async handler(request) {
      const response = await instance.handler(request);
      if (response.status === 429) {
        telemetry.rateLimited(routeOf(request.url));
      }
      return response;
    },
    async getSession(headers) {
      return parseSession(
        await instance.api.getSession({ headers, query: { disableRefresh: true } })
      );
    },
    async authenticate(headers) {
      const result = await instance.api.getSession({ headers, returnHeaders: true });
      return { session: parseSession(result.response), setCookie: result.headers.getSetCookie() };
    },
    settle: () => tasks.settle(),
  };
}
