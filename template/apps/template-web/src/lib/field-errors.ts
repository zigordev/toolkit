'use client';

import { useTranslations } from 'next-intl';
import { passwordLength } from './forms.ts';

export type FieldErrorText = (message: string | undefined) => string | undefined;

export function useFieldError(): FieldErrorText {
  const t = useTranslations('fields');
  return (message) => {
    switch (message) {
      case undefined:
        return undefined;
      case 'required':
        return t('required');
      case 'email':
        return t('email');
      case 'too-short':
        return t('tooShort', { min: passwordLength.shortest });
      case 'too-long':
        return t('tooLong', { max: passwordLength.longest });
      default:
        return t('invalid');
    }
  };
}
