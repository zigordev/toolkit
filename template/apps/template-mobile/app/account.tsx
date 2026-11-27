import { Button } from '@zigordev/ui-native';
import { Redirect, router } from 'expo-router';
import { useTranslations } from 'use-intl';
import { authClient } from '../src/auth-client.native';
import { Body, Screen } from '../src/screen.native';
import { signOut } from '../src/sign-in';

export default function Account() {
  const t = useTranslations();
  const session = authClient.useSession();

  if (session.data === null) {
    return session.isPending ? <Screen /> : <Redirect href="/sign-in" />;
  }

  const { name, email } = session.data.user;

  function leave() {
    router.dismissTo('/');
    void signOut(authClient);
  }

  return (
    <Screen>
      <Body testID="who">{t('account.who', { name, email })}</Body>
      <Button variant="outline" tone="neutral" onPress={leave} testID="sign-out">
        {t('account.signOut')}
      </Button>
    </Screen>
  );
}
