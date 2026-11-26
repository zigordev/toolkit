import type { AuthClient } from '@zigordev/auth/client';

export type Go = (path: string) => void;

export type Problem = 'wrong-credentials' | 'not-verified' | 'wrong-code' | 'too-many' | 'failed';

export interface TwoFactorSetup {
  readonly totpURI: string;
  readonly backupCodes: readonly string[];
}

interface Failure {
  readonly code?: string | undefined;
  readonly status?: number | undefined;
}

function text(form: FormData, name: string): string {
  return String(form.get(name) ?? '').trim();
}

export function problemOf(error: Failure): Problem {
  if (error.status === 429) {
    return 'too-many';
  }
  switch (error.code) {
    case 'INVALID_EMAIL_OR_PASSWORD':
    case 'INVALID_PASSWORD':
      return 'wrong-credentials';
    case 'EMAIL_NOT_VERIFIED':
      return 'not-verified';
    case 'INVALID_CODE':
    case 'INVALID_BACKUP_CODE':
    case 'OTP_HAS_EXPIRED':
      return 'wrong-code';
    case 'TOO_MANY_ATTEMPTS':
    case 'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE':
      return 'too-many';
    default:
      return 'failed';
  }
}

export async function signInWithPassword(
  client: AuthClient,
  form: FormData,
  next: string,
  go: Go
): Promise<Problem | null> {
  const { data, error } = await client.signIn.email({
    email: text(form, 'email'),
    password: String(form.get('password') ?? ''),
  });
  if (error !== null) {
    return problemOf(error);
  }
  if (!(data !== null && 'twoFactorRedirect' in data)) {
    go(next);
  }
  return null;
}

export async function signInWithGoogle(client: AuthClient, next: string): Promise<Problem | null> {
  const { error } = await client.signIn.social({ provider: 'google', callbackURL: next });
  return error === null ? null : problemOf(error);
}

export async function signInWithPasskey(
  client: AuthClient,
  next: string,
  go: Go
): Promise<Problem | null> {
  const result = await client.signIn.passkey();
  if (result?.error) {
    return problemOf(result.error);
  }
  go(next);
  return null;
}

export async function signUp(client: AuthClient, form: FormData): Promise<Problem | null> {
  const { error } = await client.signUp.email({
    name: text(form, 'name'),
    email: text(form, 'email'),
    password: String(form.get('password') ?? ''),
    callbackURL: '/account',
  });
  return error === null ? null : problemOf(error);
}

export async function verifyCode(
  client: AuthClient,
  form: FormData,
  go: Go
): Promise<Problem | null> {
  const code = text(form, 'code');
  const trustDevice = form.get('trust') === 'on';
  const { error } =
    code.length === 6
      ? await client.twoFactor.verifyTotp({ code, trustDevice })
      : await client.twoFactor.verifyBackupCode({ code, trustDevice });
  if (error !== null) {
    return problemOf(error);
  }
  go('/account');
  return null;
}

export async function addPasskey(client: AuthClient, form: FormData): Promise<'added' | Problem> {
  const result = await client.passkey.addPasskey({ name: text(form, 'name') });
  return result?.error ? problemOf(result.error) : 'added';
}

export async function enableTwoFactor(
  client: AuthClient,
  form: FormData
): Promise<TwoFactorSetup | Problem> {
  const { data, error } = await client.twoFactor.enable({
    password: String(form.get('password') ?? ''),
  });
  if (error === null && data !== null && data.method === 'totp') {
    return { totpURI: data.totpURI, backupCodes: data.backupCodes };
  }
  return error === null ? 'failed' : problemOf(error);
}

export async function confirmTwoFactor(
  client: AuthClient,
  form: FormData
): Promise<'on' | Problem> {
  const { error } = await client.twoFactor.verifyTotp({ code: text(form, 'code') });
  return error === null ? 'on' : problemOf(error);
}

export async function deleteAccount(client: AuthClient): Promise<'asked' | Problem> {
  const { error } = await client.deleteUser({ callbackURL: '/' });
  return error === null ? 'asked' : problemOf(error);
}

export async function signOut(client: AuthClient, go: Go): Promise<void> {
  await client.signOut();
  go('/');
}
