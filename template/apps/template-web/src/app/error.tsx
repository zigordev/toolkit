'use client';

import { Button } from '@zigordev/ui';
import { useTranslations } from 'next-intl';
import styles from './layout.module.css';

export default function Failure({ reset }: { readonly reset: () => void }) {
  const t = useTranslations('failure');
  return (
    <>
      <h1>{t('title')}</h1>
      <p>{t('text')}</p>
      <div className={styles.actions}>
        <Button variant="outline" tone="neutral" onClick={reset}>
          {t('retry')}
        </Button>
      </div>
    </>
  );
}
