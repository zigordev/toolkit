'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { getAuthClient } from '../../lib/auth-client.ts';
import { useProblemText } from '../../lib/problems.ts';
import {
  addPasskey,
  confirmTwoFactor,
  deleteAccount,
  enableTwoFactor,
  signOut,
  type TwoFactorSetup,
} from '../../lib/sign-in.ts';

export function AccountActions() {
  const t = useTranslations('account');
  const problemText = useProblemText();
  const [message, setMessage] = useState<string | null>(null);
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);

  function formOf(event: FormEvent<HTMLFormElement>): FormData {
    event.preventDefault();
    return new FormData(event.currentTarget);
  }

  async function addOne(event: FormEvent<HTMLFormElement>) {
    const result = await addPasskey(getAuthClient(), formOf(event));
    setMessage(result === 'added' ? t('passkeyAdded') : problemText(result, t('passkeyFailed')));
  }

  async function startTwoFactor(event: FormEvent<HTMLFormElement>) {
    const result = await enableTwoFactor(getAuthClient(), formOf(event));
    if (typeof result === 'string') {
      setMessage(problemText(result, t('turnOnFailed')));
    } else {
      setSetup(result);
      setMessage(null);
    }
  }

  async function finishTwoFactor(event: FormEvent<HTMLFormElement>) {
    const result = await confirmTwoFactor(getAuthClient(), formOf(event));
    if (result === 'on') {
      setSetup(null);
      setMessage(t('twoFactorOn'));
    } else {
      setMessage(problemText(result, t('turnOnFailed')));
    }
  }

  async function askToDelete() {
    const result = await deleteAccount(getAuthClient());
    setMessage(result === 'asked' ? t('deleteAsked') : problemText(result, t('deleteFailed')));
  }

  return (
    <>
      <section>
        <h2>{t('passkeys')}</h2>
        <form onSubmit={addOne}>
          <label>
            {t('deviceName')} <input name="name" required />
          </label>
          <button type="submit">{t('addPasskey')}</button>
        </form>
      </section>
      <section>
        <h2>{t('twoFactor')}</h2>
        {setup === null ? (
          <form onSubmit={startTwoFactor}>
            <label>
              {t('password')}{' '}
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            <button type="submit">{t('turnOn')}</button>
          </form>
        ) : (
          <form onSubmit={finishTwoFactor}>
            <p>{t('totpAddress', { address: setup.totpURI })}</p>
            <p>{t('backupCodes', { codes: setup.backupCodes.join(' ') })}</p>
            <label>
              {t('firstCode')} <input name="code" autoComplete="one-time-code" required />
            </label>
            <button type="submit">{t('confirm')}</button>
          </form>
        )}
      </section>
      <section>
        <h2>{t('leave')}</h2>
        <button
          type="button"
          onClick={() => signOut(getAuthClient(), (path) => window.location.assign(path))}
        >
          {t('signOut')}
        </button>
        <button type="button" onClick={askToDelete}>
          {t('delete')}
        </button>
      </section>
      {message === null ? null : <p role="status">{message}</p>}
    </>
  );
}
