import { describe, expect, it, vi } from 'vitest';
import { localPath, type SignInClient, signInWithPassword, signOut, verifyCode } from './sign-in';
import { RequestTimeoutError } from './timeout';

const values = { email: 'ada@example.com', password: 'correct horse battery staple' };
const signedIn = { data: { token: 'session', user: { id: 'ada' } }, error: null };

function clientWith(answer: () => Promise<{ data: unknown; error: unknown }>) {
  const call = vi.fn(answer);
  const client = {
    signIn: { email: call },
    twoFactor: { verifyTotp: call, verifyBackupCode: vi.fn(answer) },
    signOut: call,
  } as unknown as SignInClient;
  return { client, call, backup: client.twoFactor.verifyBackupCode };
}

describe('signInWithPassword', () => {
  it('signs in with the email and the password', async () => {
    const { client, call } = clientWith(async () => signedIn);

    expect(await signInWithPassword(client, values)).toBe('signed-in');
    expect(call).toHaveBeenCalledWith(values);
  });

  it('asks for the code when the account has two-factor on', async () => {
    const { client } = clientWith(async () => ({ data: { twoFactorRedirect: true }, error: null }));

    expect(await signInWithPassword(client, values)).toBe('two-factor');
  });

  it('names what went wrong, as the web app does', async () => {
    const wrong = clientWith(async () => ({
      data: null,
      error: { code: 'INVALID_EMAIL_OR_PASSWORD', status: 401 },
    }));
    const unverified = clientWith(async () => ({
      data: null,
      error: { code: 'EMAIL_NOT_VERIFIED', status: 403 },
    }));
    const tooMany = clientWith(async () => ({ data: null, error: { status: 429 } }));

    expect(await signInWithPassword(wrong.client, values)).toBe('wrong-credentials');
    expect(await signInWithPassword(unverified.client, values)).toBe('not-verified');
    expect(await signInWithPassword(tooMany.client, values)).toBe('too-many');
  });

  it('fails plainly when the API gives no answer in time', async () => {
    const { client } = clientWith(async () => {
      throw new RequestTimeoutError(10_000);
    });

    expect(await signInWithPassword(client, values)).toBe('failed');
  });
});

describe('verifyCode', () => {
  it('checks six digits as the code from the authenticator app, and passes the trust on', async () => {
    const { client, call, backup } = clientWith(async () => signedIn);

    expect(await verifyCode(client, { code: '123456', trust: true })).toBe('signed-in');
    expect(call).toHaveBeenCalledWith({ code: '123456', trustDevice: true });
    expect(backup).not.toHaveBeenCalled();
  });

  it('checks anything else as a backup code', async () => {
    const { client, call, backup } = clientWith(async () => signedIn);

    expect(await verifyCode(client, { code: 'Ab3dE-fG7hJ', trust: false })).toBe('signed-in');
    expect(backup).toHaveBeenCalledWith({ code: 'Ab3dE-fG7hJ', trustDevice: false });
    expect(call).not.toHaveBeenCalled();
  });

  it('says when the code did not work', async () => {
    const { client } = clientWith(async () => ({
      data: null,
      error: { code: 'INVALID_CODE', status: 401 },
    }));

    expect(await verifyCode(client, { code: '000000', trust: false })).toBe('wrong-code');
  });

  it('fails plainly when the API gives no answer in time', async () => {
    const { client } = clientWith(async () => {
      throw new RequestTimeoutError(10_000);
    });

    expect(await verifyCode(client, { code: '123456', trust: false })).toBe('failed');
  });
});

describe('signOut', () => {
  it('asks the API to end the session', async () => {
    const { client, call } = clientWith(async () => ({ data: { success: true }, error: null }));

    await signOut(client);

    expect(call).toHaveBeenCalledOnce();
  });

  it('still ends quietly when the API gives no answer, as the phone has forgotten the session', async () => {
    const { client } = clientWith(async () => {
      throw new RequestTimeoutError(10_000);
    });

    await expect(signOut(client)).resolves.toBeUndefined();
  });
});

describe('localPath', () => {
  it('goes back to the screen that asked for sign-in, with the web app’s rule', () => {
    expect(localPath('/notes')).toBe('/notes');
    expect(localPath(undefined)).toBe('/account');
    expect(localPath('//elsewhere.example')).toBe('/account');
    expect(localPath('https://elsewhere.example')).toBe('/account');
  });
});
