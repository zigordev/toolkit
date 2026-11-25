import type { AuthClient } from '@zigordev/auth/client';
import { describe, expect, it, vi } from 'vitest';
import {
  addPasskey,
  confirmTwoFactor,
  deleteAccount,
  enableTwoFactor,
  signInWithGoogle,
  signInWithPasskey,
  signInWithPassword,
  signOut,
  signUp,
  verifyCode,
} from './sign-in.ts';

interface Answer {
  readonly data: unknown;
  readonly error: { readonly message?: string } | null;
}

const ok = (data: unknown = {}): Answer => ({ data, error: null });
const failed = (message?: string): Answer => ({
  data: null,
  error: message === undefined ? {} : { message },
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

  it('says why it failed, with a plain fallback', async () => {
    const go = vi.fn();

    expect(
      await signInWithPassword(
        clientAnswering({ email: failed('Invalid email or password') }).auth,
        form({}),
        '/',
        go
      )
    ).toBe('Invalid email or password');
    expect(
      await signInWithPassword(clientAnswering({ email: failed() }).auth, form({}), '/', go)
    ).toBe('The email or the password is wrong.');
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
    expect(await signInWithGoogle(clientAnswering({ social: failed() }).auth, '/')).toBe(
      'Google sign-in is not available.'
    );
  });

  it('signs in with a passkey and goes on, or says why not', async () => {
    const go = vi.fn();

    expect(await signInWithPasskey(clientAnswering({}).auth, '/notes', go)).toBeNull();
    expect(go).toHaveBeenCalledWith('/notes');
    expect(await signInWithPasskey(clientAnswering({ passkey: failed() }).auth, '/', go)).toBe(
      'The passkey did not sign you in.'
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
    expect(await signUp(clientAnswering({ signUp: failed() }).auth, form({}))).toBe(
      'The account could not be created.'
    );
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
      await verifyCode(clientAnswering({ totp: failed() }).auth, form({ code: '000000' }), go)
    ).toBe('That code did not work.');
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
    ).toBe('Two-factor could not be turned on.');
    expect(
      await enableTwoFactor(clientAnswering({ enable: failed('Invalid password') }).auth, form({}))
    ).toBe('Invalid password');
    expect(await confirmTwoFactor(clientAnswering({}).auth, form({ code: '123456' }))).toBe(
      'Two-factor is on.'
    );
    expect(await confirmTwoFactor(clientAnswering({ totp: failed() }).auth, form({}))).toBe(
      'That code did not work.'
    );
  });
});

describe('the account page', () => {
  it('adds a passkey, asks for the deletion link, and signs out', async () => {
    const go = vi.fn();
    const { client, auth } = clientAnswering({});

    expect(await addPasskey(auth, form({ name: 'Laptop' }))).toBe('Passkey added.');
    expect(await addPasskey(clientAnswering({ addPasskey: failed() }).auth, form({}))).toBe(
      'The passkey was not added.'
    );
    expect(await deleteAccount(auth)).toBe('Check your inbox: a link there deletes your account.');
    expect(await deleteAccount(clientAnswering({ deleteUser: failed() }).auth)).toBe(
      'The request failed.'
    );
    await signOut(auth, go);
    expect(client.signOut).toHaveBeenCalled();
    expect(go).toHaveBeenCalledWith('/');
  });
});
