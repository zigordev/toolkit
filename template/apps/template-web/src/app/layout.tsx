import '@fontsource-variable/mona-sans/wdth.css';
import '@fontsource-variable/jetbrains-mono';
import '@zigordev/ui/ui.css';
import { LinkButton } from '@zigordev/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { timeZone } from '../i18n/locales.ts';
import { environmentOf, getConfig } from '../lib/config.ts';
import { LanguageSwitch } from './language-switch.tsx';
import styles from './layout.module.css';
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
  const config = getConfig();
  return (
    <html lang={locale} data-mode="system">
      <body>
        <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
          <header className={styles.header}>
            <LinkButton
              render={<Link href="/" />}
              variant="ghost"
              tone="neutral"
              aria-label={app('home')}
            >
              {app('name')}
            </LinkButton>
            <LanguageSwitch
              current={locale}
              label={language('label')}
              names={{ en: language('en'), es: language('es') }}
            />
          </header>
          {config.RUM_URL === undefined ? null : (
            <Rum
              url={config.RUM_URL}
              app={config.OTEL_SERVICE_NAME}
              version={config.OTEL_SERVICE_VERSION}
              environment={environmentOf(config.OTEL_RESOURCE_ATTRIBUTES)}
            />
          )}
          <main className={styles.main}>
            <Providers>{children}</Providers>
          </main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
