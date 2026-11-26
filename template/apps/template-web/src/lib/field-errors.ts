'use client';

import { useTranslations } from 'next-intl';
import { noteLength, passwordLength } from './forms.ts';

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
      case 'password-too-short':
        return t('tooShort', { min: passwordLength.shortest });
      case 'password-too-long':
        return t('tooLong', { max: passwordLength.longest });
      case 'title-too-long':
        return t('tooLong', { max: noteLength.title });
      case 'body-too-long':
        return t('tooLong', { max: noteLength.body });
      default:
        return t('invalid');
    }
  };
}
