import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { testLocale } from '../../test/locale.ts';
import { asHtml, textsIn } from '../../test/texts.ts';
import RootLayout, { generateMetadata } from './layout.tsx';

describe('the root layout', () => {
  it('wraps every page in a document in the chosen language, with a header and one main', async () => {
    const t = textsIn('en');

    const html = renderToStaticMarkup(await RootLayout({ children: 'page' }));

    expect(html).toMatch(/^<html lang="en" data-mode="system"><head><\/head><body><header /);
    expect(html).toContain(`aria-label="${asHtml(t('app.home'))}"`);
    expect(html).toContain(`href="/">${asHtml(t('app.name'))}</a>`);
    expect(html).toContain(`<nav aria-label="${asHtml(t('language.label'))}">`);
    expect(html).toMatch(/value="en" lang="en" aria-pressed="true"/);
    expect(html).toMatch(/value="es" lang="es" aria-pressed="false"/);
    expect(html).toContain(`>${asHtml(t('language.en'))}</button>`);
    expect(html).toContain(`>${asHtml(t('language.es'))}</button>`);
    expect(html).toMatch(/<main class="[^"]+">page<\/main>/);
    expect(await generateMetadata()).toEqual({ title: t('app.name') });
  });

  it('says it all in Spanish when Spanish is chosen', async () => {
    testLocale.current = 'es';

    const html = renderToStaticMarkup(await RootLayout({ children: 'página' }));

    expect(html).toMatch(/^<html lang="es" data-mode="system">/);
    expect(html).toContain(`<nav aria-label="${asHtml(textsIn('es')('language.label'))}">`);
    expect(html).toMatch(/value="es" lang="es" aria-pressed="true"/);
  });
});
