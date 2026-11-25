'use client';

import { type FormEvent, useState } from 'react';
import { getAuthClient } from '../../lib/auth-client.ts';
import {
  addPasskey,
  confirmTwoFactor,
  deleteAccount,
  enableTwoFactor,
  signOut,
  type TwoFactorSetup,
} from '../../lib/sign-in.ts';

export function AccountActions() {
  const [message, setMessage] = useState<string | null>(null);
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);

  function formOf(event: FormEvent<HTMLFormElement>): FormData {
    event.preventDefault();
    return new FormData(event.currentTarget);
  }

  async function startTwoFactor(event: FormEvent<HTMLFormElement>) {
    const result = await enableTwoFactor(getAuthClient(), formOf(event));
    if (typeof result === 'string') {
      setMessage(result);
    } else {
      setSetup(result);
    }
  }

  async function finishTwoFactor(event: FormEvent<HTMLFormElement>) {
    const result = await confirmTwoFactor(getAuthClient(), formOf(event));
    if (result === 'Two-factor is on.') {
      setSetup(null);
    }
    setMessage(result);
  }

  return (
    <>
      <section>
        <h2>Passkeys</h2>
        <form
          onSubmit={async (event) => setMessage(await addPasskey(getAuthClient(), formOf(event)))}
        >
          <label>
            Name of this device <input name="name" required />
          </label>
          <button type="submit">Add a passkey</button>
        </form>
      </section>
      <section>
        <h2>Two-factor</h2>
        {setup === null ? (
          <form onSubmit={startTwoFactor}>
            <label>
              Your password{' '}
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            <button type="submit">Turn on two-factor</button>
          </form>
        ) : (
          <form onSubmit={finishTwoFactor}>
            <p>Add this address to your authenticator app: {setup.totpURI}</p>
            <p>Keep these backup codes somewhere safe: {setup.backupCodes.join(' ')}</p>
            <label>
              The first code from the app{' '}
              <input name="code" autoComplete="one-time-code" required />
            </label>
            <button type="submit">Confirm</button>
          </form>
        )}
      </section>
      <section>
        <h2>Leave</h2>
        <button
          type="button"
          onClick={() => signOut(getAuthClient(), (path) => window.location.assign(path))}
        >
          Sign out
        </button>
        <button
          type="button"
          onClick={async () => setMessage(await deleteAccount(getAuthClient()))}
        >
          Delete my account
        </button>
      </section>
      {message === null ? null : <p role="status">{message}</p>}
    </>
  );
}
