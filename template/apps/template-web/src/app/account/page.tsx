import { getTranslations } from 'next-intl/server';
import { getNextAuth } from '../../lib/auth.ts';
import { AccountActions } from './account-actions.client.tsx';

export const dynamic = 'force-dynamic';

export default async function Account() {
  const user = await getNextAuth().requireUser('/account');
  const t = await getTranslations('account');
  return (
    <>
      <h1>{t('title')}</h1>
      <p>{t('who', { name: user.name, email: user.email })}</p>
      <AccountActions />
    </>
  );
}
