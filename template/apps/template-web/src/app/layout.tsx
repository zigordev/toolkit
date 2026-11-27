import '@fontsource-variable/mona-sans/wdth.css';
import '@fontsource-variable/jetbrains-mono';
import '@zigordev/ui/ui.css';
import { AppShell, LinkButton, type Place, TopBar } from '@zigordev/ui';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { connection } from 'next/server';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { timeZone } from '../i18n/locales.ts';
import { signedInUser } from '../lib/auth.ts';
import { environmentOf, getConfig } from '../lib/config.ts';
import { modeCookie, modeFrom } from '../lib/mode.ts';
import { Account } from './account-menu.client.tsx';
import { LanguageSwitch } from './language-switch.tsx';
import styles from './layout.module.css';
import { Navigation } from './navigation.client.tsx';
import { Palette } from './palette.client.tsx';
import { Providers } from './providers.tsx';
import { Rum } from './rum.client.tsx';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return { title: t('name') };
}

export default async function RootLayout({ children }: { readonly children: ReactNode }) {
  await connection();
  const locale = await getLocale();
  const messages = await getMessages();
  const app = await getTranslations('app');
  const language = await getTranslations('language');
  const nav = await getTranslations('nav');
  const palette = await getTranslations('palette');
  const accountMenu = await getTranslations('accountMenu');
  const account = await getTranslations('account');
  const mode = modeFrom((await cookies()).get(modeCookie)?.value);
  const user = await signedInUser();
  const languages = { en: language('en'), es: language('es') };
  const places = [
    { href: '/', label: nav('home'), icon: 'house' },
    { href: '/notes', label: nav('notes'), icon: 'notebook-pen' },
    { href: '/account', label: nav('account'), icon: 'circle-user' },
  ] satisfies Place[];
  const config = getConfig();
  return (
    <html lang={locale} data-mode={mode}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
          {config.RUM_URL === undefined ? null : (
            <Rum
              url={config.RUM_URL}
              app={config.OTEL_SERVICE_NAME}
              version={config.OTEL_SERVICE_VERSION}
              environment={environmentOf(config.OTEL_RESOURCE_ATTRIBUTES)}
            />
          )}
          <AppShell
            skipLinkLabel={app('skipToContent')}
            topBar={
              <TopBar
                start={
                  <LinkButton
                    render={<Link href="/" />}
                    variant="ghost"
                    tone="neutral"
                    aria-label={app('home')}
                  >
                    {app('name')}
                  </LinkButton>
                }
                end={
                  <>
                    <Palette
                      places={places}
                      locale={locale}
                      languages={languages}
                      texts={{
                        label: palette('label'),
                        placeholder: palette('placeholder'),
                        empty: palette('empty'),
                        close: palette('close'),
                        places: palette('places'),
                        language: language('label'),
                      }}
                    />
                    {user === null ? (
                      <LanguageSwitch
                        current={locale}
                        label={language('label')}
                        names={languages}
                      />
                    ) : (
                      <Account
                        name={user.name}
                        email={user.email}
                        locale={locale}
                        languages={languages}
                        mode={mode}
                        texts={{
                          label: accountMenu('label', { name: user.name }),
                          language: language('label'),
                          appearance: accountMenu('appearance'),
                          modes: {
                            system: accountMenu('system'),
                            light: accountMenu('light'),
                            dark: accountMenu('dark'),
                          },
                          settings: accountMenu('settings'),
                          signOut: account('signOut'),
                        }}
                      />
                    )}
                  </>
                }
              />
            }
            nav={<Navigation label={nav('label')} places={places} />}
          >
            <div className={styles.page}>
              <Providers>{children}</Providers>
            </div>
          </AppShell>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
