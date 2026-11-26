import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testLocale } from '../../test/locale.ts';
import { asHtml, textsIn } from '../../test/texts.ts';
import { generateMetadata } from './layout.tsx';

beforeEach(() => {
  vi.stubEnv('OTEL_SERVICE_NAME', 'template-web');
  vi.stubEnv('API_URL', 'http://template-api:3000');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function layout(children: string): Promise<string> {
  const { default: RootLayout } = await import('./layout.tsx');
  return renderToStaticMarkup(await RootLayout({ children }));
}

describe('the root layout', () => {
  it('wraps every page in a document in the chosen language, with a header and one main', async () => {
    const t = textsIn('en');

    const html = await layout('page');

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

  it('renders the same with browser monitoring on, which starts in the browser only', async () => {
    vi.stubEnv('RUM_URL', '/rum');
    vi.stubEnv('OTEL_RESOURCE_ATTRIBUTES', 'deployment.environment.name=local');

    expect(await layout('page')).toMatch(/<main class="[^"]+">page<\/main>/);
  });

  it('says it all in Spanish when Spanish is chosen', async () => {
    testLocale.current = 'es';

    const html = await layout('página');

    expect(html).toMatch(/^<html lang="es" data-mode="system">/);
    expect(html).toContain(`<nav aria-label="${asHtml(textsIn('es')('language.label'))}">`);
    expect(html).toMatch(/value="es" lang="es" aria-pressed="true"/);
  });
});
