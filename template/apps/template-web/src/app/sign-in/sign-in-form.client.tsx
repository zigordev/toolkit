'use client';

import { Alert, Button, TextField } from '@zigordev/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { getAuthClient } from '../../lib/auth-client.ts';
import { useFieldError } from '../../lib/field-errors.ts';
import { signInFields, zodResolver } from '../../lib/forms.ts';
import { go } from '../../lib/navigate.ts';
import { useProblemText } from '../../lib/problems.ts';
import { signInWithGoogle, signInWithPasskey, signInWithPassword } from '../../lib/sign-in.ts';
import styles from '../forms.module.css';

export function SignInForm({ next }: { readonly next: string }) {
  const t = useTranslations('signIn');
  const problemText = useProblemText();
  const fieldError = useFieldError();
  const [message, setMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(signInFields),
    defaultValues: { email: '', password: '' },
  });

  const withPassword = handleSubmit(async (values) => {
    const problem = await signInWithPassword(getAuthClient(), values, next, go);
    setMessage(problem === null ? null : problemText(problem, t('failed')));
  });

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
      <form className={styles.form} onSubmit={withPassword} noValidate>
        <TextField
          label={t('email')}
          type="email"
          autoComplete="username webauthn"
          error={fieldError(errors.email?.message)}
          {...register('email')}
        />
        <TextField
          label={t('password')}
          type="password"
          autoComplete="current-password"
          error={fieldError(errors.password?.message)}
          {...register('password')}
        />
        <Button type="submit" loading={isSubmitting}>
          {t('submit')}
        </Button>
      </form>
      <div className={styles.choices}>
        <Button variant="outline" tone="neutral" onClick={withGoogle}>
          {t('google')}
        </Button>
        <Button variant="outline" tone="neutral" onClick={withPasskey}>
          {t('passkey')}
        </Button>
      </div>
      {message === null ? null : <Alert tone="danger">{message}</Alert>}
    </>
  );
}
