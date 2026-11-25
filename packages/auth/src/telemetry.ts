import type { Meter } from '@opentelemetry/api';
import { createCounterAtZero, type Logger } from '@zigordev/otel';
import type { AuthEmailKind } from './emails.ts';
import { maskedError } from './library-logger.ts';

export type SignInOutcome = 'success' | 'failure';
export type EmailOutcome = 'sent' | 'failed';

export interface AuthTelemetry {
  signedUp(method: string, userId: string): void;
  signedIn(method: string, userId: string): void;
  signInFailed(method: string, reason: string): void;
  signedOut(userId: string): void;
  emailVerified(userId: string): void;
  passwordReset(userId: string): void;
  accountLinked(method: string, userId: string): void;
  accountDeleted(userId: string): void;
  passkeyAdded(userId: string): void;
  passkeyRemoved(userId: string): void;
  twoFactorEnabled(userId: string): void;
  twoFactorDisabled(userId: string): void;
  accountDeletionFailed(userId: string, error: unknown): void;
  emailSent(kind: AuthEmailKind): void;
  emailFailed(kind: AuthEmailKind, error: unknown): void;
  rateLimited(route: string): void;
}

export interface AuthTelemetryOptions {
  readonly logger: Logger;
  readonly meter: Meter;
  readonly methods: readonly string[];
  readonly emailKinds: readonly AuthEmailKind[];
  readonly deletions: boolean;
}

const signInOutcomes: readonly SignInOutcome[] = ['success', 'failure'];
const emailOutcomes: readonly EmailOutcome[] = ['sent', 'failed'];

export function createAuthTelemetry(options: AuthTelemetryOptions): AuthTelemetry {
  const { logger, meter, methods, emailKinds, deletions } = options;
  const signIns = createCounterAtZero(
    meter,
    'auth.user.sign_ins',
    { description: 'Sign-in attempts, by method and outcome', unit: '{sign_in}' },
    methods.flatMap((method) => signInOutcomes.map((outcome) => ({ method, outcome })))
  );
  const signUps = createCounterAtZero(
    meter,
    'auth.user.sign_ups',
    { description: 'Accounts created, by the method used to create them', unit: '{user}' },
    methods.filter((method) => method !== 'passkey').map((method) => ({ method }))
  );
  const emailSends =
    emailKinds.length === 0
      ? undefined
      : createCounterAtZero(
          meter,
          'auth.email.sends',
          {
            description: 'Authentication emails handed to the sender, by kind and outcome',
            unit: '{email}',
          },
          emailKinds.flatMap((kind) => emailOutcomes.map((outcome) => ({ kind, outcome })))
        );

  const accountDeletions = deletions
    ? createCounterAtZero(meter, 'auth.user.deletions', {
        description: 'Accounts deleted by their owners',
        unit: '{user}',
      })
    : undefined;

  return {
    signedUp(method, userId) {
      signUps.add(1, { method });
      logger.info({ event: 'auth.signed_up', method, userId });
    },
    signedIn(method, userId) {
      signIns.add(1, { method, outcome: 'success' });
      logger.info({ event: 'auth.signed_in', method, userId });
    },
    signInFailed(method, reason) {
      signIns.add(1, { method, outcome: 'failure' });
      logger.warn({ event: 'auth.sign_in_failed', method, reason });
    },
    signedOut(userId) {
      logger.info({ event: 'auth.signed_out', userId });
    },
    emailVerified(userId) {
      logger.info({ event: 'auth.email_verified', userId });
    },
    passwordReset(userId) {
      logger.info({ event: 'auth.password_reset', userId });
    },
    accountLinked(method, userId) {
      logger.info({ event: 'auth.account_linked', method, userId });
    },
    accountDeleted(userId) {
      accountDeletions?.add(1);
      logger.info({ event: 'auth.account_deleted', userId });
    },
    passkeyAdded(userId) {
      logger.info({ event: 'auth.passkey_added', userId });
    },
    passkeyRemoved(userId) {
      logger.info({ event: 'auth.passkey_removed', userId });
    },
    twoFactorEnabled(userId) {
      logger.info({ event: 'auth.two_factor_enabled', userId });
    },
    twoFactorDisabled(userId) {
      logger.info({ event: 'auth.two_factor_disabled', userId });
    },
    accountDeletionFailed(userId, error) {
      logger.error({ event: 'auth.account_deletion_failed', userId, error: maskedError(error) });
    },
    emailSent(kind) {
      emailSends?.add(1, { kind, outcome: 'sent' });
    },
    emailFailed(kind, error) {
      emailSends?.add(1, { kind, outcome: 'failed' });
      logger.error({ event: 'auth.email_failed', kind, error: maskedError(error) });
    },
    rateLimited(route) {
      logger.warn({ event: 'auth.rate_limited', route });
    },
  };
}
