import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testLocale } from '../../test/locale.ts';
import { asHtml, textsIn } from '../../test/texts.ts';
import { generateMetadata } from './layout.tsx';

vi.mock('next/navigation', () => ({ usePathname: () => '/notes' }));

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
  it('wraps every page in the shell: a skip link, a top bar, the main places and one main', async () => {
    const t = textsIn('en');

    const html = await layout('page');

    expect(html).toMatch(
      /^<html lang="en" data-mode="system"><head><\/head><body><div class="ds-app-shell">/
    );
    expect(html).toContain(
      `<a class="ds-skip-link" href="#main">${asHtml(t('app.skipToContent'))}</a>`
    );
    expect(html).toContain('<header class="ds-top-bar">');
    expect(html).toContain(`aria-label="${asHtml(t('app.home'))}"`);
    expect(html).toContain(`href="/">${asHtml(t('app.name'))}</a>`);
    expect(html).toContain(`<nav aria-label="${asHtml(t('language.label'))}">`);
    expect(html).toMatch(/value="en" lang="en" aria-pressed="true"/);
    expect(html).toMatch(/value="es" lang="es" aria-pressed="false"/);
    expect(html).toContain(`>${asHtml(t('language.en'))}</button>`);
    expect(html).toContain(`>${asHtml(t('language.es'))}</button>`);
    expect(html).toContain(`<nav aria-label="${asHtml(t('nav.label'))}" class="ds-app-nav">`);
    expect(html).toContain('<a class="ds-app-nav__link" aria-current="page" href="/notes">');
    expect(html).toContain('<a class="ds-app-nav__link" href="/">');
    for (const place of ['nav.home', 'nav.notes', 'nav.account'] as const) {
      expect(html).toContain(`<span class="ds-app-nav__label">${asHtml(t(place))}</span>`);
    }
    expect(html).toMatch(
      /<main id="main" tabindex="-1" class="ds-app-shell__main"><div class="[^"]+">page<\/div><\/main>/
    );
    expect(await generateMetadata()).toEqual({ title: t('app.name') });
  });

  it('renders the same with browser monitoring on, which starts in the browser only', async () => {
    vi.stubEnv('RUM_URL', '/rum');
    vi.stubEnv('OTEL_RESOURCE_ATTRIBUTES', 'deployment.environment.name=local');

    expect(await layout('page')).toMatch(
      /<main id="main" tabindex="-1" class="ds-app-shell__main"><div class="[^"]+">page<\/div><\/main>/
    );
  });

  it('says it all in Spanish when Spanish is chosen', async () => {
    testLocale.current = 'es';
    const t = textsIn('es');

    const html = await layout('página');

    expect(html).toMatch(/^<html lang="es" data-mode="system">/);
    expect(html).toContain(`<nav aria-label="${asHtml(t('language.label'))}">`);
    expect(html).toMatch(/value="es" lang="es" aria-pressed="true"/);
    expect(html).toContain(`<nav aria-label="${asHtml(t('nav.label'))}" class="ds-app-nav">`);
    expect(html).toContain(`>${asHtml(t('app.skipToContent'))}</a>`);
  });
});
