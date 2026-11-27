import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, useTokens } from '@zigordev/ui-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { IntlProvider, useTranslations } from 'use-intl';
import { deviceLocale } from '../src/locale';
import { messages } from '../src/messages';
import { createQueryClient } from '../src/query-client';

function Screens() {
  const t = useTranslations();
  const tokens = useTokens();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: tokens['color-bg-page'] },
        headerTintColor: tokens['color-fg-default'],
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: tokens['color-bg-page'] },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="sign-in" options={{ title: t('signIn.title') }} />
      <Stack.Screen name="two-factor" options={{ title: t('twoFactor.title') }} />
      <Stack.Screen name="account" options={{ title: t('account.title') }} />
      <Stack.Screen name="notes/index" options={{ title: t('notes.title') }} />
      <Stack.Screen name="notes/new" options={{ title: t('notes.newTitle') }} />
      <Stack.Screen name="notes/[noteId]" options={{ title: '' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [client] = useState(createQueryClient);
  const locale = deviceLocale();
  return (
    <IntlProvider
      locale={locale}
      messages={messages[locale]}
      timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
    >
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <StatusBar style="auto" />
          <Screens />
        </ThemeProvider>
      </QueryClientProvider>
    </IntlProvider>
  );
}
