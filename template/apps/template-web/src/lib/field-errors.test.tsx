import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { textsIn } from '../../test/texts.ts';
import { messagesOf } from '../i18n/messages.ts';
import { useFieldError } from './field-errors.ts';

const messages = [
  undefined,
  'required',
  'email',
  'password-too-short',
  'password-too-long',
  'title-too-long',
  'body-too-long',
  'something-else',
];

function Words() {
  const fieldError = useFieldError();
  return <>{messages.map((message) => `${fieldError(message) ?? 'none'}|`)}</>;
}

describe('the words for a field that fails', () => {
  it('names each problem in the chosen language, with the limits of a password', () => {
    const t = textsIn('es');

    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="es" messages={messagesOf('es')} timeZone="UTC">
        <Words />
      </NextIntlClientProvider>
    );

    expect(html.split('|').filter((part) => part !== '')).toEqual([
      'none',
      t('fields.required'),
      t('fields.email'),
      t('fields.tooShort', { min: 15 }),
      t('fields.tooLong', { max: 128 }),
      t('fields.tooLong', { max: 200 }),
      t('fields.tooLong', { max: 10_000 }),
      t('fields.invalid'),
    ]);
  });
});
