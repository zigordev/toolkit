import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Locale } from '../i18n/locales.ts';
import { messagesOf } from '../i18n/messages.ts';
import { useProblemText } from './problems.ts';
import type { Problem } from './sign-in.ts';

const problems: Problem[] = [
  'wrong-credentials',
  'not-verified',
  'wrong-code',
  'too-many',
  'failed',
];

function Texts() {
  const problemText = useProblemText();
  return <>{problems.map((problem) => `${problemText(problem, 'the fallback')}|`)}</>;
}

function textsIn(locale: Locale): string[] {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={messagesOf(locale)}>
      <Texts />
    </NextIntlClientProvider>
  )
    .split('|')
    .filter((text) => text !== '');
}

describe('the words for a problem', () => {
  it('names each problem in the chosen language, and the fallback for any other', () => {
    expect(textsIn('en')).toEqual([
      'The email or the password is wrong.',
      'Confirm your email address first: the link is in your inbox.',
      'That code did not work.',
      'Too many tries. Wait a minute, then try again.',
      'the fallback',
    ]);
    expect(textsIn('es')[0]).toBe('El correo o la contraseña no son correctos.');
  });
});
