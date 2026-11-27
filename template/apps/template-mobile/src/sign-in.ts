import type { CodeValues, SignInValues } from '../../template-web/src/lib/forms';
import { type Problem, problemOf } from '../../template-web/src/lib/sign-in';

export { localPath } from '../../template-web/src/lib/paths';
export type { Problem };

export type SignInStep = 'signed-in' | 'two-factor' | Problem;

interface Failure {
  readonly code?: string | undefined;
  readonly status?: number | undefined;
}

interface Answer {
  readonly data: unknown;
  readonly error: Failure | null;
}

interface Code {
  readonly code: string;
  readonly trustDevice: boolean;
}

export interface SignInClient {
  readonly signIn: { readonly email: (values: SignInValues) => Promise<Answer> };
  readonly twoFactor: {
    readonly verifyTotp: (values: Code) => Promise<Answer>;
    readonly verifyBackupCode: (values: Code) => Promise<Answer>;
  };
  readonly signOut: () => Promise<unknown>;
}

function asksForCode(data: unknown): boolean {
  return typeof data === 'object' && data !== null && 'twoFactorRedirect' in data;
}

export async function signInWithPassword(
  client: SignInClient,
  values: SignInValues
): Promise<SignInStep> {
  try {
    const { data, error } = await client.signIn.email(values);
    if (error !== null) {
      return problemOf(error);
    }
    return asksForCode(data) ? 'two-factor' : 'signed-in';
  } catch {
    return 'failed';
  }
}

export async function verifyCode(
  client: SignInClient,
  { code, trust }: CodeValues
): Promise<'signed-in' | Problem> {
  const values = { code, trustDevice: trust };
  try {
    const { error } =
      code.length === 6
        ? await client.twoFactor.verifyTotp(values)
        : await client.twoFactor.verifyBackupCode(values);
    return error === null ? 'signed-in' : problemOf(error);
  } catch {
    return 'failed';
  }
}

export async function signOut(client: SignInClient): Promise<void> {
  await client.signOut().catch(() => undefined);
}
