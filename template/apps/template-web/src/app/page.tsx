import { LinkButton } from '@zigordev/ui';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getGreeting } from '../lib/api.ts';
import { getConfig } from '../lib/config.ts';
import { getLogger } from '../lib/logger.ts';
import styles from './layout.module.css';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const t = await getTranslations('home');
  const greeting = await getGreeting({ url: getConfig().API_URL, logger: getLogger() });
  return (
    <>
      <h1>{t('title')}</h1>
      <p>{greeting ?? t('apiDown')}</p>
      <div className={styles.actions}>
        <LinkButton render={<Link href="/notes" />}>{t('notes')}</LinkButton>
        <LinkButton render={<Link href="/account" />} variant="outline" tone="neutral">
          {t('account')}
        </LinkButton>
      </div>
    </>
  );
}
