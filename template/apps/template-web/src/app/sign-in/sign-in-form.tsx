'use client';

import { type FormEvent, useState } from 'react';
import { getAuthClient } from '../../lib/auth-client.ts';
import { signInWithGoogle, signInWithPasskey, signInWithPassword } from '../../lib/sign-in.ts';

const go = (path: string) => window.location.assign(path);

export function SignInForm({ next }: { readonly next: string }) {
  const [message, setMessage] = useState<string | null>(null);

  async function withPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(
      await signInWithPassword(getAuthClient(), new FormData(event.currentTarget), next, go)
    );
  }

  return (
    <>
      <form onSubmit={withPassword}>
        <label>
          Email <input name="email" type="email" autoComplete="username webauthn" required />
        </label>
        <label>
          Password{' '}
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            minLength={15}
            maxLength={128}
            required
          />
        </label>
        <button type="submit">Sign in</button>
      </form>
      <button
        type="button"
        onClick={async () => setMessage(await signInWithGoogle(getAuthClient(), next))}
      >
        Continue with Google
      </button>
      <button
        type="button"
        onClick={async () => setMessage(await signInWithPasskey(getAuthClient(), next, go))}
      >
        Sign in with a passkey
      </button>
      {message === null ? null : <p role="alert">{message}</p>}
    </>
  );
}
