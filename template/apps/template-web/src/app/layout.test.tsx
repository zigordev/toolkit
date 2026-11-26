import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { testLocale } from '../../test/locale.ts';
import RootLayout, { generateMetadata } from './layout.tsx';

describe('the root layout', () => {
  it('wraps every page in a document in the chosen language, under the language switch', async () => {
    const html = renderToStaticMarkup(await RootLayout({ children: 'page' }));

    expect(html).toMatch(/^<html lang="en"><head><\/head><body>/);
    expect(html).toContain('<nav aria-label="Language">');
    expect(html).toMatch(
      /<button type="submit" value="en" lang="en" aria-pressed="true" name="locale">English<\/button>/
    );
    expect(html).toMatch(
      /<button type="submit" value="es" lang="es" aria-pressed="false" name="locale">Español<\/button>/
    );
    expect(html).toContain('</nav>page');
    expect(await generateMetadata()).toEqual({ title: 'Template' });
  });

  it('says it all in Spanish when Spanish is chosen', async () => {
    testLocale.current = 'es';

    const html = renderToStaticMarkup(await RootLayout({ children: 'página' }));

    expect(html).toMatch(/^<html lang="es">/);
    expect(html).toContain('<nav aria-label="Idioma">');
    expect(html).toMatch(/value="es" lang="es" aria-pressed="true" name="locale">Español/);
  });
});
