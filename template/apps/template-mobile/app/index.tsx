import { Alert, Button, lineHeight, useTokens } from '@zigordev/ui-native';
import { router } from 'expo-router';
import { Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslations } from 'use-intl';
import { api } from '../src/api';
import { authClient } from '../src/auth-client.native';
import { showsFailure } from '../src/failure';

export default function Home() {
  const t = useTranslations();
  const tokens = useTokens();
  const hello = api.useQuery('get', '/api/v1/hello');
  const session = authClient.useSession();
  const title = tokens['font-size-3xl'];
  const body = tokens['font-size-lg'];
  return (
    <SafeAreaView
      style={{
        flex: 1,
        gap: tokens['space-4'],
        padding: tokens['space-6'],
        backgroundColor: tokens['color-bg-page'],
      }}
    >
      <Text
        accessibilityRole="header"
        style={{
          color: tokens['color-fg-default'],
          fontSize: title,
          fontWeight: tokens['font-weight-bold'],
          lineHeight: lineHeight(title, tokens['font-line-height-tight']),
        }}
      >
        {t('home.title')}
      </Text>
      {showsFailure(hello) ? (
        <>
          <Alert tone="danger" testID="api-down">
            {t('home.apiDown')}
          </Alert>
          <Button
            variant="soft"
            loading={hello.isFetching}
            onPress={() => void hello.refetch()}
            testID="retry"
          >
            {t('failure.retry')}
          </Button>
        </>
      ) : (
        <Text
          testID="greeting"
          style={{
            color: tokens['color-fg-muted'],
            fontSize: body,
            lineHeight: lineHeight(body, tokens['font-line-height-normal']),
          }}
        >
          {hello.data?.message ?? ''}
        </Text>
      )}
      <Button
        variant="outline"
        tone="neutral"
        onPress={() => router.push(session.data === null ? '/sign-in' : '/account')}
        testID="account"
      >
        {t('home.account')}
      </Button>
    </SafeAreaView>
  );
}
