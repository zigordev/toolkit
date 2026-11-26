import type { AuthClient } from '@zigordev/auth/client';
import { describe, expect, it, vi } from 'vitest';
import {
  addPasskey,
  confirmTwoFactor,
  deleteAccount,
  enableTwoFactor,
  problemOf,
  signInWithGoogle,
  signInWithPasskey,
  signInWithPassword,
  signOut,
  signUp,
  verifyCode,
} from './sign-in.ts';

interface Answer {
  readonly data: unknown;
  readonly error: { readonly code?: string; readonly status?: number } | null;
}

const ok = (data: unknown = {}): Answer => ({ data, error: null });
const failed = (code?: string): Answer => ({
  data: null,
  error: code === undefined ? {} : { code },
});

function clientAnswering(answers: Record<string, Answer | undefined>) {
  const answer = (name: string) => vi.fn(async () => answers[name] ?? ok());
  const client = {
    signIn: { email: answer('email'), social: answer('social'), passkey: answer('passkey') },
    signUp: { email: answer('signUp') },
    twoFactor: {
      verifyTotp: answer('totp'),
      verifyBackupCode: answer('backup'),
      enable: answer('enable'),
    },
    passkey: { addPasskey: answer('addPasskey') },
    deleteUser: answer('deleteUser'),
    signOut: answer('signOut'),
  };
  return { client, auth: client as unknown as AuthClient };
}

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) {
    data.set(name, value);
  }
  return data;
}

describe('signing in with a password', () => {
  it('goes on to the next page, and leaves the second factor to its own page', async () => {
    const go = vi.fn();
    const { client, auth } = clientAnswering({});

    expect(
      await signInWithPassword(
        auth,
        form({ email: ' ada@example.com ', password: 'p' }),
        '/notes',
        go
      )
    ).toBeNull();
    expect(client.signIn.email).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'p' });
    expect(go).toHaveBeenCalledWith('/notes');

    const twoFactor = clientAnswering({ email: ok({ twoFactorRedirect: true }) });
    go.mockClear();
    expect(await signInWithPassword(twoFactor.auth, form({}), '/notes', go)).toBeNull();
    expect(go).not.toHaveBeenCalled();
  });

  it('says why it failed, as a code the page puts into words', async () => {
    const go = vi.fn();

    expect(
      await signInWithPassword(
        clientAnswering({ email: failed('INVALID_EMAIL_OR_PASSWORD') }).auth,
        form({}),
        '/',
        go
      )
    ).toBe('wrong-credentials');
    expect(
      await signInWithPassword(clientAnswering({ email: failed() }).auth, form({}), '/', go)
    ).toBe('failed');
    expect(go).not.toHaveBeenCalled();
  });
});

describe('the other ways to sign in', () => {
  it('starts Google with the next page as its callback', async () => {
    const { client, auth } = clientAnswering({});

    expect(await signInWithGoogle(auth, '/notes')).toBeNull();
    expect(client.signIn.social).toHaveBeenCalledWith({
      provider: 'google',
      callbackURL: '/notes',
    });
    expect(await signInWithGoogle(clientAnswering({ social: failed() }).auth, '/')).toBe('failed');
  });

  it('signs in with a passkey and goes on, or says why not', async () => {
    const go = vi.fn();

    expect(await signInWithPasskey(clientAnswering({}).auth, '/notes', go)).toBeNull();
    expect(go).toHaveBeenCalledWith('/notes');
    expect(await signInWithPasskey(clientAnswering({ passkey: failed() }).auth, '/', go)).toBe(
      'failed'
    );
  });

  it('signs up and sends the confirmation link to the account page', async () => {
    const { client, auth } = clientAnswering({});

    expect(
      await signUp(auth, form({ name: 'Ada', email: 'ada@example.com', password: 'p' }))
    ).toBeNull();
    expect(client.signUp.email).toHaveBeenCalledWith({
      name: 'Ada',
      email: 'ada@example.com',
      password: 'p',
      callbackURL: '/account',
    });
    expect(await signUp(clientAnswering({ signUp: failed() }).auth, form({}))).toBe('failed');
  });
});

describe('the second factor', () => {
  it('takes 6 digits as an authenticator code and anything else as a backup code', async () => {
    const go = vi.fn();
    const { client, auth } = clientAnswering({});

    expect(await verifyCode(auth, form({ code: '123456', trust: 'on' }), go)).toBeNull();
    expect(client.twoFactor.verifyTotp).toHaveBeenCalledWith({ code: '123456', trustDevice: true });
    await verifyCode(auth, form({ code: 'abcde-fghij' }), go);
    expect(client.twoFactor.verifyBackupCode).toHaveBeenCalledWith({
      code: 'abcde-fghij',
      trustDevice: false,
    });
    expect(go).toHaveBeenCalledWith('/account');
    expect(
      await verifyCode(
        clientAnswering({ totp: failed('INVALID_CODE') }).auth,
        form({ code: '000000' }),
        go
      )
    ).toBe('wrong-code');
  });

  it('turns two-factor on with the address for the app and the backup codes', async () => {
    const setup = {
      method: 'totp',
      totpURI: 'otpauth://totp/Template:ada',
      backupCodes: ['a', 'b'],
    };

    expect(
      await enableTwoFactor(clientAnswering({ enable: ok(setup) }).auth, form({ password: 'p' }))
    ).toEqual({ totpURI: setup.totpURI, backupCodes: ['a', 'b'] });
    expect(
      await enableTwoFactor(clientAnswering({ enable: ok({ method: 'otp' }) }).auth, form({}))
    ).toBe('failed');
    expect(
      await enableTwoFactor(clientAnswering({ enable: failed('INVALID_PASSWORD') }).auth, form({}))
    ).toBe('wrong-credentials');
    expect(await confirmTwoFactor(clientAnswering({}).auth, form({ code: '123456' }))).toBe('on');
    expect(
      await confirmTwoFactor(clientAnswering({ totp: failed('OTP_HAS_EXPIRED') }).auth, form({}))
    ).toBe('wrong-code');
  });
});

describe('the account page', () => {
  it('adds a passkey, asks for the deletion link, and signs out', async () => {
    const go = vi.fn();
    const { client, auth } = clientAnswering({});

    expect(await addPasskey(auth, form({ name: 'Laptop' }))).toBe('added');
    expect(await addPasskey(clientAnswering({ addPasskey: failed() }).auth, form({}))).toBe(
      'failed'
    );
    expect(await deleteAccount(auth)).toBe('asked');
    expect(await deleteAccount(clientAnswering({ deleteUser: failed() }).auth)).toBe('failed');
    await signOut(auth, go);
    expect(client.signOut).toHaveBeenCalled();
    expect(go).toHaveBeenCalledWith('/');
  });
});

describe('problemOf', () => {
  it.each([
    [{ code: 'INVALID_EMAIL_OR_PASSWORD' }, 'wrong-credentials'],
    [{ code: 'INVALID_PASSWORD' }, 'wrong-credentials'],
    [{ code: 'EMAIL_NOT_VERIFIED' }, 'not-verified'],
    [{ code: 'INVALID_CODE' }, 'wrong-code'],
    [{ code: 'INVALID_BACKUP_CODE' }, 'wrong-code'],
    [{ code: 'OTP_HAS_EXPIRED' }, 'wrong-code'],
    [{ code: 'TOO_MANY_ATTEMPTS' }, 'too-many'],
    [{ code: 'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE' }, 'too-many'],
    [{ status: 429 }, 'too-many'],
    [{ code: 'SOMETHING_ELSE', status: 500 }, 'failed'],
    [{}, 'failed'],
  ])('turns %j into %s', (error, problem) => {
    expect(problemOf(error)).toBe(problem);
  });
});
