'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { getAuthClient } from '../../lib/auth-client.ts';
import { useProblemText } from '../../lib/problems.ts';
import { verifyCode } from '../../lib/sign-in.ts';

const trustedDays = 30;

export function TwoFactorForm() {
  const t = useTranslations('twoFactor');
  const problemText = useProblemText();
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = await verifyCode(getAuthClient(), new FormData(event.currentTarget), (path) =>
      window.location.assign(path)
    );
    setMessage(problem === null ? null : problemText(problem, t('failed')));
  }

  return (
    <form onSubmit={submit}>
      <label>
        {t('code')} <input name="code" autoComplete="one-time-code" required />
      </label>
      <label>
        <input name="trust" type="checkbox" /> {t('trust', { days: trustedDays })}
      </label>
      <button type="submit">{t('submit')}</button>
      {message === null ? null : <p role="alert">{message}</p>}
    </form>
  );
}
