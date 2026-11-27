import { Alert, Button, Checkbox, TextField } from '@zigordev/ui-native';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { authClient } from '../src/auth-client.native';
import { check, codeFields } from '../src/forms';
import { Screen } from '../src/screen.native';
import { verifyCode } from '../src/sign-in';
import { fieldText, problemText } from '../src/texts';

const trustedDays = 30;

export default function TwoFactor() {
  const t = useTranslations();
  const session = authClient.useSession();
  const [code, setCode] = useState('');
  const [trust, setTrust] = useState(false);
  const [problems, setProblems] = useState<Readonly<Record<string, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session.data !== null) {
    return <Redirect href="/account" />;
  }

  async function submit() {
    const checked = check(codeFields, { code, trust });
    setProblems(checked.problems);
    if (checked.values === null) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await verifyCode(authClient, checked.values);
    setBusy(false);
    if (result === 'signed-in') {
      router.replace('/account');
    } else {
      setMessage(problemText(t, result, t('twoFactor.failed')));
    }
  }

  return (
    <Screen>
      <TextField
        label={t('twoFactor.code')}
        value={code}
        onChangeText={setCode}
        error={fieldText(t, problems.code)}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        onSubmitEditing={() => void submit()}
        testID="code"
      />
      <Checkbox
        label={t('twoFactor.trust', { days: trustedDays })}
        checked={trust}
        onChange={setTrust}
        testID="trust"
      />
      <Button loading={busy} onPress={() => void submit()} testID="verify">
        {t('twoFactor.submit')}
      </Button>
      {message === null ? null : (
        <Alert tone="danger" testID="code-problem">
          {message}
        </Alert>
      )}
    </Screen>
  );
}
