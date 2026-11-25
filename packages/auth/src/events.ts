import type { BetterAuthPlugin } from 'better-auth';
import { createAuthMiddleware, isAPIError } from 'better-auth/api';
import type { AuthTelemetry } from './telemetry.ts';

export interface EndpointContext {
  readonly path?: string | undefined;
  readonly params?: unknown;
  readonly body?: unknown;
}

export interface AccountReader {
  findAccounts(userId: string): Promise<readonly unknown[]>;
}

const emailPaths = new Set([
  '/sign-in/email',
  '/sign-up/email',
  '/verify-email',
  '/reset-password',
  '/two-factor/verify-totp',
  '/two-factor/verify-backup-code',
]);

const signInPaths = new Set([
  '/sign-in/email',
  '/sign-in/social',
  '/callback/:id',
  '/verify-email',
  '/passkey/verify-authentication',
  '/two-factor/verify-totp',
  '/two-factor/verify-backup-code',
]);

const secondFactorPaths = new Set(['/two-factor/verify-totp', '/two-factor/verify-backup-code']);

function field(value: unknown, name: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, name) : undefined;
}

export function methodName(providerId: string): string {
  return providerId === 'credential' ? 'email' : providerId;
}

export function createMethodResolver(knownMethods: readonly string[]) {
  const known = new Set(knownMethods);
  const bounded = (method: unknown): string =>
    typeof method === 'string' && known.has(method) ? method : 'other';
  return (context: EndpointContext | null | undefined): string => {
    const path = context?.path;
    if (path === undefined) {
      return 'other';
    }
    if (emailPaths.has(path)) {
      return bounded('email');
    }
    if (path === '/callback/:id') {
      return bounded(field(context?.params, 'id'));
    }
    if (path === '/passkey/verify-authentication') {
      return bounded('passkey');
    }
    if (path === '/sign-in/social') {
      return bounded(field(context?.body, 'provider'));
    }
    return 'other';
  };
}

function errorReason(value: unknown): string {
  const code = field(field(value, 'body'), 'code');
  const status = field(value, 'status');
  const reason = typeof code === 'string' ? code : String(status);
  return reason.toLowerCase();
}

export function callbackError(location: string | null | undefined, baseUrl: string): string | null {
  if (!location) {
    return null;
  }
  return new URL(location, baseUrl).searchParams.get('error');
}

export interface AuthEventHooksOptions {
  readonly telemetry: AuthTelemetry;
  readonly methods: readonly string[];
  readonly baseUrl: string;
  readonly cookiePrefix: string;
}

export function authEventHooks(options: AuthEventHooksOptions) {
  const { telemetry, baseUrl } = options;
  const methodOf = createMethodResolver(options.methods);
  const twoFactorCookie = new RegExp(`(^|;\\s*)(__Secure-)?${options.cookiePrefix}\\.two_factor=`);

  const after = createAuthMiddleware(async (ctx) => {
    const returned = ctx.context.returned;
    const failed = isAPIError(returned);
    const newSession = ctx.context.newSession;
    const secondFactor = secondFactorPaths.has(ctx.path);
    const signingIn = !secondFactor || twoFactorCookie.test(ctx.headers?.get('cookie') ?? '');
    if (signInPaths.has(ctx.path) && newSession && signingIn) {
      telemetry.signedIn(methodOf(ctx), newSession.user.id);
      return;
    }
    if (
      (ctx.path === '/sign-in/email' || ctx.path === '/passkey/verify-authentication') &&
      failed
    ) {
      telemetry.signInFailed(methodOf(ctx), errorReason(returned));
      return;
    }
    if (secondFactor) {
      if (failed && signingIn) {
        telemetry.signInFailed(methodOf(ctx), errorReason(returned));
      }
      return;
    }
    const userId = ctx.context.session?.user.id;
    if (ctx.path === '/passkey/verify-registration' && !failed && userId !== undefined) {
      telemetry.passkeyAdded(userId);
      return;
    }
    if (ctx.path === '/passkey/delete-passkey' && !failed && userId !== undefined) {
      telemetry.passkeyRemoved(userId);
      return;
    }
    if (ctx.path === '/callback/:id') {
      const reason = callbackError(ctx.context.responseHeaders?.get('location'), baseUrl);
      if (reason !== null) {
        telemetry.signInFailed(methodOf(ctx), reason.toLowerCase());
      }
    }
  });

  const plugin: BetterAuthPlugin = {
    id: 'auth-telemetry',
    hooks: { after: [{ matcher: () => true, handler: after }] },
  };

  const databaseHooks = {
    user: {
      create: {
        after: async (user: { id: string }, context: EndpointContext | null) => {
          telemetry.signedUp(methodOf(context), user.id);
        },
      },
      update: {
        after: async (
          user: { id: string; twoFactorEnabled?: unknown },
          context: EndpointContext | null
        ) => {
          if (context?.path === '/two-factor/disable' && user.twoFactorEnabled === false) {
            telemetry.twoFactorDisabled(user.id);
          } else if (context?.path?.startsWith('/two-factor/') && user.twoFactorEnabled === true) {
            telemetry.twoFactorEnabled(user.id);
          }
        },
      },
    },
    session: {
      delete: {
        after: async (session: { userId: string }, context: EndpointContext | null) => {
          if (context?.path === '/sign-out') {
            telemetry.signedOut(session.userId);
          }
        },
      },
    },
    account: {
      create: {
        after: async (
          account: { userId: string; providerId: string },
          context: (EndpointContext & { context?: { internalAdapter?: AccountReader } }) | null
        ) => {
          const reader = context?.context?.internalAdapter;
          if (reader === undefined) {
            return;
          }
          const accounts = await reader.findAccounts(account.userId);
          if (accounts.length > 1) {
            telemetry.accountLinked(methodName(account.providerId), account.userId);
          }
        },
      },
    },
  };

  return { plugin, databaseHooks };
}
