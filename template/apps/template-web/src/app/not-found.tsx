import { LinkButton } from '@zigordev/ui';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import styles from './layout.module.css';

export default async function NotFound() {
  const t = await getTranslations('notFound');
  return (
    <>
      <h1>{t('title')}</h1>
      <p>{t('text')}</p>
      <div className={styles.actions}>
        <LinkButton render={<Link href="/" />} variant="outline" tone="neutral">
          {t('home')}
        </LinkButton>
      </div>
    </>
  );
}
