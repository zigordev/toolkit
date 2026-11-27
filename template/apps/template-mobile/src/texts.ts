import { noteLength } from './forms';
import type { Problem } from './sign-in';

type TextKey =
  | 'fields.required'
  | 'fields.email'
  | 'fields.invalid'
  | 'fields.tooLong'
  | 'problems.wrongCredentials'
  | 'problems.notVerified'
  | 'problems.wrongCode'
  | 'problems.tooMany';

export type Translate = (key: TextKey, values?: { readonly max: number }) => string;

export function fieldText(t: Translate, problem: string | undefined): string | undefined {
  switch (problem) {
    case undefined:
      return undefined;
    case 'required':
      return t('fields.required');
    case 'email':
      return t('fields.email');
    case 'title-too-long':
      return t('fields.tooLong', { max: noteLength.title });
    case 'body-too-long':
      return t('fields.tooLong', { max: noteLength.body });
    default:
      return t('fields.invalid');
  }
}

export function problemText(t: Translate, problem: Problem, failed: string): string {
  switch (problem) {
    case 'wrong-credentials':
      return t('problems.wrongCredentials');
    case 'not-verified':
      return t('problems.notVerified');
    case 'wrong-code':
      return t('problems.wrongCode');
    case 'too-many':
      return t('problems.tooMany');
    case 'failed':
      return failed;
  }
}
