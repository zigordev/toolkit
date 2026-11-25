import type { AuthClient } from '@zigordev/auth/client';

export type Go = (path: string) => void;

export interface TwoFactorSetup {
  readonly totpURI: string;
  readonly backupCodes: readonly string[];
}

interface Failure {
  readonly message?: string | undefined;
}

function text(form: FormData, name: string): string {
  return String(form.get(name) ?? '').trim();
}

function messageOf(error: Failure, fallback: string): string {
  return error.message ?? fallback;
}

export async function signInWithPassword(
  client: AuthClient,
  form: FormData,
  next: string,
  go: Go
): Promise<string | null> {
  const { data, error } = await client.signIn.email({
    email: text(form, 'email'),
    password: String(form.get('password') ?? ''),
  });
  if (error !== null) {
    return messageOf(error, 'The email or the password is wrong.');
  }
  if (!(data !== null && 'twoFactorRedirect' in data)) {
    go(next);
  }
  return null;
}

export async function signInWithGoogle(client: AuthClient, next: string): Promise<string | null> {
  const { error } = await client.signIn.social({ provider: 'google', callbackURL: next });
  return error === null ? null : messageOf(error, 'Google sign-in is not available.');
}

export async function signInWithPasskey(
  client: AuthClient,
  next: string,
  go: Go
): Promise<string | null> {
  const result = await client.signIn.passkey();
  if (result?.error) {
    return messageOf(result.error, 'The passkey did not sign you in.');
  }
  go(next);
  return null;
}

export async function signUp(client: AuthClient, form: FormData): Promise<string | null> {
  const { error } = await client.signUp.email({
    name: text(form, 'name'),
    email: text(form, 'email'),
    password: String(form.get('password') ?? ''),
    callbackURL: '/account',
  });
  return error === null ? null : messageOf(error, 'The account could not be created.');
}

export async function verifyCode(
  client: AuthClient,
  form: FormData,
  go: Go
): Promise<string | null> {
  const code = text(form, 'code');
  const trustDevice = form.get('trust') === 'on';
  const { error } =
    code.length === 6
      ? await client.twoFactor.verifyTotp({ code, trustDevice })
      : await client.twoFactor.verifyBackupCode({ code, trustDevice });
  if (error !== null) {
    return messageOf(error, 'That code did not work.');
  }
  go('/account');
  return null;
}

export async function addPasskey(client: AuthClient, form: FormData): Promise<string> {
  const result = await client.passkey.addPasskey({ name: text(form, 'name') });
  return result?.error ? messageOf(result.error, 'The passkey was not added.') : 'Passkey added.';
}

export async function enableTwoFactor(
  client: AuthClient,
  form: FormData
): Promise<TwoFactorSetup | string> {
  const { data, error } = await client.twoFactor.enable({
    password: String(form.get('password') ?? ''),
  });
  if (error === null && data !== null && data.method === 'totp') {
    return { totpURI: data.totpURI, backupCodes: data.backupCodes };
  }
  return error === null
    ? 'Two-factor could not be turned on.'
    : messageOf(error, 'Two-factor could not be turned on.');
}

export async function confirmTwoFactor(client: AuthClient, form: FormData): Promise<string> {
  const { error } = await client.twoFactor.verifyTotp({ code: text(form, 'code') });
  return error === null ? 'Two-factor is on.' : messageOf(error, 'That code did not work.');
}

export async function deleteAccount(client: AuthClient): Promise<string> {
  const { error } = await client.deleteUser({ callbackURL: '/' });
  return error === null
    ? 'Check your inbox: a link there deletes your account.'
    : messageOf(error, 'The request failed.');
}

export async function signOut(client: AuthClient, go: Go): Promise<void> {
  await client.signOut();
  go('/');
}
