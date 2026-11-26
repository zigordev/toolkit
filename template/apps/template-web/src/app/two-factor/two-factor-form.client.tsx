'use client';

import { Alert, Button, Checkbox, TextField } from '@zigordev/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { getAuthClient } from '../../lib/auth-client.ts';
import { useFieldError } from '../../lib/field-errors.ts';
import { codeFields, zodResolver } from '../../lib/forms.ts';
import { go } from '../../lib/navigate.ts';
import { useProblemText } from '../../lib/problems.ts';
import { verifyCode } from '../../lib/sign-in.ts';
import styles from '../forms.module.css';

const trustedDays = 30;

export function TwoFactorForm() {
  const t = useTranslations('twoFactor');
  const problemText = useProblemText();
  const fieldError = useFieldError();
  const [message, setMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(codeFields),
    defaultValues: { code: '', trust: false },
  });

  const submit = handleSubmit(async (values) => {
    const problem = await verifyCode(getAuthClient(), values, go);
    setMessage(problem === null ? null : problemText(problem, t('failed')));
  });

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <TextField
        label={t('code')}
        autoComplete="one-time-code"
        error={fieldError(errors.code?.message)}
        {...register('code')}
      />
      <Checkbox label={t('trust', { days: trustedDays })} {...register('trust')} />
      <Button type="submit" loading={isSubmitting}>
        {t('submit')}
      </Button>
      {message === null ? null : <Alert tone="danger">{message}</Alert>}
    </form>
  );
}
