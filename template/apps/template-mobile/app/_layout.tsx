import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { IntlProvider } from 'use-intl';
import { deviceLocale } from '../src/locale';
import { messages } from '../src/messages';

export default function RootLayout() {
  const [client] = useState(() => new QueryClient());
  const locale = deviceLocale();
  return (
    <IntlProvider
      locale={locale}
      messages={messages[locale]}
      timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
    >
      <QueryClientProvider client={client}>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }} />
      </QueryClientProvider>
    </IntlProvider>
  );
}
