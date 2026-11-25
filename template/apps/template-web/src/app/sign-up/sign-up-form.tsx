'use client';

import { type FormEvent, useState } from 'react';
import { getAuthClient } from '../../lib/auth-client.ts';
import { signUp } from '../../lib/sign-in.ts';

export function SignUpForm() {
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const failure = await signUp(getAuthClient(), new FormData(event.currentTarget));
    setSent(failure === null);
    setMessage(failure);
  }

  if (sent) {
    return <p>Check your inbox: a link there confirms your address and signs you in.</p>;
  }
  return (
    <form onSubmit={submit}>
      <label>
        Name <input name="name" autoComplete="name" required />
      </label>
      <label>
        Email <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Password, 15 to 128 characters{' '}
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={15}
          maxLength={128}
          required
        />
      </label>
      <button type="submit">Sign up</button>
      {message === null ? null : <p role="alert">{message}</p>}
    </form>
  );
}
