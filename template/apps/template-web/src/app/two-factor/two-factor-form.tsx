'use client';

import { type FormEvent, useState } from 'react';
import { getAuthClient } from '../../lib/auth-client.ts';
import { verifyCode } from '../../lib/sign-in.ts';

export function TwoFactorForm() {
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(
      await verifyCode(getAuthClient(), new FormData(event.currentTarget), (path) =>
        window.location.assign(path)
      )
    );
  }

  return (
    <form onSubmit={submit}>
      <label>
        The 6 digits from your authenticator app, or a backup code{' '}
        <input name="code" autoComplete="one-time-code" required />
      </label>
      <label>
        <input name="trust" type="checkbox" /> Trust this device for 30 days
      </label>
      <button type="submit">Continue</button>
      {message === null ? null : <p role="alert">{message}</p>}
    </form>
  );
}
