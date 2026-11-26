import { getTranslations } from 'next-intl/server';
import { TwoFactorForm } from './two-factor-form.client.tsx';

export default async function TwoFactor() {
  const t = await getTranslations('twoFactor');
  return (
    <>
      <h1>{t('title')}</h1>
      <TwoFactorForm />
    </>
  );
}
