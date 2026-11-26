import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { textsIn } from '../../test/texts.ts';
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

function wordsIn(locale: Locale): string[] {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={messagesOf(locale)} timeZone="UTC">
      <Texts />
    </NextIntlClientProvider>
  )
    .split('|')
    .filter((text) => text !== '');
}

describe('the words for a problem', () => {
  it('names each problem in the chosen language, and the fallback for any other', () => {
    const en = textsIn('en');
    expect(wordsIn('en')).toEqual([
      en('problems.wrongCredentials'),
      en('problems.notVerified'),
      en('problems.wrongCode'),
      en('problems.tooMany'),
      'the fallback',
    ]);
    expect(wordsIn('es')[0]).toBe(textsIn('es')('problems.wrongCredentials'));
  });
});
