import { getTranslations } from 'next-intl/server';
import { TwoFactorForm } from './two-factor-form.tsx';

export default async function TwoFactor() {
  const t = await getTranslations('twoFactor');
  return (
    <main>
      <h1>{t('title')}</h1>
      <TwoFactorForm />
    </main>
  );
}
