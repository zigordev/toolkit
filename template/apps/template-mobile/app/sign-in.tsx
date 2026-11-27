import { Alert, Button, TextField } from '@zigordev/ui-native';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { authClient } from '../src/auth-client.native';
import { check, signInFields } from '../src/forms';
import { Screen } from '../src/screen.native';
import { signInWithPassword } from '../src/sign-in';
import { fieldText, problemText } from '../src/texts';

export default function SignIn() {
  const t = useTranslations();
  const session = authClient.useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [problems, setProblems] = useState<Readonly<Record<string, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session.data !== null) {
    return <Redirect href="/account" />;
  }

  async function submit() {
    const checked = check(signInFields, { email, password });
    setProblems(checked.problems);
    if (checked.values === null) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const step = await signInWithPassword(authClient, checked.values);
    setBusy(false);
    if (step === 'signed-in') {
      router.replace('/account');
    } else if (step === 'two-factor') {
      router.replace('/two-factor');
    } else {
      setMessage(problemText(t, step, t('signIn.failed')));
    }
  }

  return (
    <Screen>
      <TextField
        label={t('signIn.email')}
        value={email}
        onChangeText={setEmail}
        error={fieldText(t, problems.email)}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="username"
        testID="email"
      />
      <TextField
        label={t('signIn.password')}
        value={password}
        onChangeText={setPassword}
        error={fieldText(t, problems.password)}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={() => void submit()}
        testID="password"
      />
      <Button loading={busy} onPress={() => void submit()} testID="sign-in">
        {t('signIn.submit')}
      </Button>
      {message === null ? null : (
        <Alert tone="danger" testID="sign-in-problem">
          {message}
        </Alert>
      )}
    </Screen>
  );
}
