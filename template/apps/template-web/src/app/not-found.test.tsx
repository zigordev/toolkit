import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { testLocale } from '../../test/locale.ts';
import { asHtml, textsIn } from '../../test/texts.ts';
import { messagesOf } from '../i18n/messages.ts';
import Failure from './error.tsx';
import NotFound from './not-found.tsx';

describe('the pages for a missing page and a failure', () => {
  it('say the page does not exist, and lead to the start page, in the chosen language', async () => {
    testLocale.current = 'es';
    const t = textsIn('es');

    const html = renderToStaticMarkup(await NotFound());

    expect(html).toContain(`<h1>${asHtml(t('notFound.title'))}</h1>`);
    expect(html).toContain(`<p>${asHtml(t('notFound.text'))}</p>`);
    expect(html).toMatch(/href="\/"/);
  });

  it('say that something went wrong, and offer to try again', () => {
    const t = textsIn('en');

    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={messagesOf('en')}>
        <Failure reset={() => undefined} />
      </NextIntlClientProvider>
    );

    expect(html).toContain(`<h1>${asHtml(t('failure.title'))}</h1>`);
    expect(html).toContain(`>${asHtml(t('failure.retry'))}</button>`);
  });
});
