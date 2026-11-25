import { createHash } from 'node:crypto';

interface AuthEmailBase {
  readonly to: string;
  readonly name: string;
  readonly idempotencyKey: string;
  readonly request: Request | undefined;
}

export interface VerifyEmailMessage extends AuthEmailBase {
  readonly kind: 'verify-email';
  readonly url: string;
}

export interface ResetPasswordMessage extends AuthEmailBase {
  readonly kind: 'reset-password';
  readonly url: string;
}

export interface AccountExistsMessage extends AuthEmailBase {
  readonly kind: 'account-exists';
}

export interface DeleteAccountMessage extends AuthEmailBase {
  readonly kind: 'delete-account';
  readonly url: string;
}

export type AuthEmail =
  | VerifyEmailMessage
  | ResetPasswordMessage
  | AccountExistsMessage
  | DeleteAccountMessage;

export type AuthEmailKind = AuthEmail['kind'];

export type AuthEmailSender = (email: AuthEmail) => Promise<void>;

export const authEmailKinds: readonly AuthEmailKind[] = [
  'verify-email',
  'reset-password',
  'account-exists',
  'delete-account',
];

export const passwordEmailKinds: readonly AuthEmailKind[] = [
  'verify-email',
  'reset-password',
  'account-exists',
];

const accountExistsWindowMs = 10 * 60 * 1000;

export function tokenIdempotencyKey(kind: AuthEmailKind, token: string): string {
  return `auth-${kind}-${createHash('sha256').update(token).digest('hex')}`;
}

export function accountExistsIdempotencyKey(userId: string, now: number = Date.now()): string {
  return `auth-account-exists-${userId}-${Math.floor(now / accountExistsWindowMs)}`;
}
