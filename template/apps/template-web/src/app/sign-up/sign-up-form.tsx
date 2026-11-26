'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { getAuthClient } from '../../lib/auth-client.ts';
import { useProblemText } from '../../lib/problems.ts';
import { signUp } from '../../lib/sign-in.ts';

const shortest = 15;
const longest = 128;

export function SignUpForm() {
  const t = useTranslations('signUp');
  const problemText = useProblemText();
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = await signUp(getAuthClient(), new FormData(event.currentTarget));
    setSent(problem === null);
    setMessage(problem === null ? null : problemText(problem, t('failed')));
  }

  if (sent) {
    return <p>{t('sent')}</p>;
  }
  return (
    <form onSubmit={submit}>
      <label>
        {t('name')} <input name="name" autoComplete="name" required />
      </label>
      <label>
        {t('email')} <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        {t('password', { min: shortest, max: longest })}{' '}
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={shortest}
          maxLength={longest}
          required
        />
      </label>
      <button type="submit">{t('submit')}</button>
      {message === null ? null : <p role="alert">{message}</p>}
    </form>
  );
}
