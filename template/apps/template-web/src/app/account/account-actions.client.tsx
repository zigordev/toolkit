'use client';

import { Alert, Button, TextField } from '@zigordev/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { getAuthClient } from '../../lib/auth-client.ts';
import { useFieldError } from '../../lib/field-errors.ts';
import { confirmFields, passkeyFields, passwordFields, zodResolver } from '../../lib/forms.ts';
import { go } from '../../lib/navigate.ts';
import { useProblemText } from '../../lib/problems.ts';
import {
  addPasskey,
  confirmTwoFactor,
  deleteAccount,
  enableTwoFactor,
  signOut,
  type TwoFactorSetup,
} from '../../lib/sign-in.ts';
import styles from '../forms.module.css';

interface Notice {
  readonly tone: 'success' | 'danger';
  readonly text: string;
}

export function AccountActions() {
  const t = useTranslations('account');
  const problemText = useProblemText();
  const fieldError = useFieldError();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const passkey = useForm({ resolver: zodResolver(passkeyFields), defaultValues: { name: '' } });
  const password = useForm({
    resolver: zodResolver(passwordFields),
    defaultValues: { password: '' },
  });
  const confirm = useForm({ resolver: zodResolver(confirmFields), defaultValues: { code: '' } });

  const addOne = passkey.handleSubmit(async (values) => {
    const result = await addPasskey(getAuthClient(), values);
    setNotice(
      result === 'added'
        ? { tone: 'success', text: t('passkeyAdded') }
        : { tone: 'danger', text: problemText(result, t('passkeyFailed')) }
    );
  });

  const startTwoFactor = password.handleSubmit(async (values) => {
    const result = await enableTwoFactor(getAuthClient(), values);
    if (typeof result === 'string') {
      setNotice({ tone: 'danger', text: problemText(result, t('turnOnFailed')) });
    } else {
      setSetup(result);
      setNotice(null);
    }
  });

  const finishTwoFactor = confirm.handleSubmit(async (values) => {
    const result = await confirmTwoFactor(getAuthClient(), values);
    if (result === 'on') {
      setSetup(null);
      setNotice({ tone: 'success', text: t('twoFactorOn') });
    } else {
      setNotice({ tone: 'danger', text: problemText(result, t('turnOnFailed')) });
    }
  });

  async function askToDelete() {
    const result = await deleteAccount(getAuthClient());
    setNotice(
      result === 'asked'
        ? { tone: 'success', text: t('deleteAsked') }
        : { tone: 'danger', text: problemText(result, t('deleteFailed')) }
    );
  }

  return (
    <>
      <section className={styles.section} aria-labelledby="passkeys">
        <h2 id="passkeys">{t('passkeys')}</h2>
        <form className={styles.form} onSubmit={addOne} noValidate>
          <TextField
            label={t('deviceName')}
            error={fieldError(passkey.formState.errors.name?.message)}
            {...passkey.register('name')}
          />
          <Button type="submit" variant="soft" loading={passkey.formState.isSubmitting}>
            {t('addPasskey')}
          </Button>
        </form>
      </section>
      <section className={styles.section} aria-labelledby="two-factor">
        <h2 id="two-factor">{t('twoFactor')}</h2>
        {setup === null ? (
          <form className={styles.form} onSubmit={startTwoFactor} noValidate>
            <TextField
              label={t('password')}
              type="password"
              autoComplete="current-password"
              error={fieldError(password.formState.errors.password?.message)}
              {...password.register('password')}
            />
            <Button type="submit" variant="soft" loading={password.formState.isSubmitting}>
              {t('turnOn')}
            </Button>
          </form>
        ) : (
          <form className={styles.form} onSubmit={finishTwoFactor} noValidate>
            <p>{t('totpAddress')}</p>
            <code className={styles.address}>{setup.totpURI}</code>
            <p>{t('backupCodes')}</p>
            <ul className={styles.codes}>
              {setup.backupCodes.map((code) => (
                <li key={code}>
                  <code>{code}</code>
                </li>
              ))}
            </ul>
            <TextField
              label={t('firstCode')}
              autoComplete="one-time-code"
              error={fieldError(confirm.formState.errors.code?.message)}
              {...confirm.register('code')}
            />
            <Button type="submit" loading={confirm.formState.isSubmitting}>
              {t('confirm')}
            </Button>
          </form>
        )}
      </section>
      <section className={styles.section} aria-labelledby="leave">
        <h2 id="leave">{t('leave')}</h2>
        <div className={styles.choices}>
          <Button variant="outline" tone="neutral" onClick={() => signOut(getAuthClient(), go)}>
            {t('signOut')}
          </Button>
          <Button variant="outline" tone="danger" onClick={askToDelete}>
            {t('delete')}
          </Button>
        </div>
      </section>
      {notice === null ? null : <Alert tone={notice.tone}>{notice.text}</Alert>}
    </>
  );
}
