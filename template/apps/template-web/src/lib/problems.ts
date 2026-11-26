'use client';

import { useTranslations } from 'next-intl';
import type { Problem } from './sign-in.ts';

export type ProblemText = (problem: Problem, failed: string) => string;

export function useProblemText(): ProblemText {
  const t = useTranslations('problems');
  return (problem, failed) => {
    switch (problem) {
      case 'wrong-credentials':
        return t('wrongCredentials');
      case 'not-verified':
        return t('notVerified');
      case 'wrong-code':
        return t('wrongCode');
      case 'too-many':
        return t('tooMany');
      case 'failed':
        return failed;
    }
  };
}
