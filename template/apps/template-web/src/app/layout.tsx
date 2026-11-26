import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { LanguageSwitch } from './language-switch.tsx';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return { title: t('name') };
}

export default async function RootLayout({ children }: { readonly children: ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  const t = await getTranslations('language');
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <LanguageSwitch
            current={locale}
            label={t('label')}
            names={{ en: t('en'), es: t('es') }}
          />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
