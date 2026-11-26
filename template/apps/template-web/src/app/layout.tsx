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
import { LanguageSwitch } from './language-switch.tsx';
import styles from './layout.module.css';

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
  return (
    <html lang={locale} data-mode="system">
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
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
          <main className={styles.main}>{children}</main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
