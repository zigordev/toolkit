'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { getAuthClient } from '../../lib/auth-client.ts';
import { useProblemText } from '../../lib/problems.ts';
import { signInWithGoogle, signInWithPasskey, signInWithPassword } from '../../lib/sign-in.ts';

const go = (path: string) => window.location.assign(path);

export function SignInForm({ next }: { readonly next: string }) {
  const t = useTranslations('signIn');
  const problemText = useProblemText();
  const [message, setMessage] = useState<string | null>(null);

  async function withPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = await signInWithPassword(
      getAuthClient(),
      new FormData(event.currentTarget),
      next,
      go
    );
    setMessage(problem === null ? null : problemText(problem, t('failed')));
  }

  async function withGoogle() {
    const problem = await signInWithGoogle(getAuthClient(), next);
    setMessage(problem === null ? null : problemText(problem, t('googleFailed')));
  }

  async function withPasskey() {
    const problem = await signInWithPasskey(getAuthClient(), next, go);
    setMessage(problem === null ? null : problemText(problem, t('passkeyFailed')));
  }

  return (
    <>
      <form onSubmit={withPassword}>
        <label>
          {t('email')} <input name="email" type="email" autoComplete="username webauthn" required />
        </label>
        <label>
          {t('password')}{' '}
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            minLength={15}
            maxLength={128}
            required
          />
        </label>
        <button type="submit">{t('submit')}</button>
      </form>
      <button type="button" onClick={withGoogle}>
        {t('google')}
      </button>
      <button type="button" onClick={withPasskey}>
        {t('passkey')}
      </button>
      {message === null ? null : <p role="alert">{message}</p>}
    </>
  );
}
