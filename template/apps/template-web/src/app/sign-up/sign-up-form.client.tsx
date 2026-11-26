'use client';

import { Alert, Button, TextField } from '@zigordev/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { getAuthClient } from '../../lib/auth-client.ts';
import { useFieldError } from '../../lib/field-errors.ts';
import { passwordLength, signUpFields, zodResolver } from '../../lib/forms.ts';
import { useProblemText } from '../../lib/problems.ts';
import { signUp } from '../../lib/sign-in.ts';
import styles from '../forms.module.css';

export function SignUpForm() {
  const t = useTranslations('signUp');
  const problemText = useProblemText();
  const fieldError = useFieldError();
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(signUpFields),
    defaultValues: { name: '', email: '', password: '' },
  });

  const submit = handleSubmit(async (values) => {
    const problem = await signUp(getAuthClient(), values);
    setSent(problem === null);
    setMessage(problem === null ? null : problemText(problem, t('failed')));
  });

  if (sent) {
    return <Alert tone="success">{t('sent')}</Alert>;
  }
  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <TextField
        label={t('name')}
        autoComplete="name"
        error={fieldError(errors.name?.message)}
        {...register('name')}
      />
      <TextField
        label={t('email')}
        type="email"
        autoComplete="email"
        error={fieldError(errors.email?.message)}
        {...register('email')}
      />
      <TextField
        label={t('password')}
        description={t('passwordHint', {
          min: passwordLength.shortest,
          max: passwordLength.longest,
        })}
        type="password"
        autoComplete="new-password"
        minLength={passwordLength.shortest}
        maxLength={passwordLength.longest}
        error={fieldError(errors.password?.message)}
        {...register('password')}
      />
      <Button type="submit" loading={isSubmitting}>
        {t('submit')}
      </Button>
      {message === null ? null : <Alert tone="danger">{message}</Alert>}
    </form>
  );
}
