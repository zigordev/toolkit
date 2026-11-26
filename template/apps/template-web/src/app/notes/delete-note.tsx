'use client';

import { recordInteraction } from '@zigordev/rum';
import { Alert, Button } from '@zigordev/ui';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { notesClient } from '../../lib/notes-client.ts';
import styles from '../layout.module.css';

export function DeleteNote({ id }: { readonly id: string }) {
  const t = useTranslations('notes');
  const router = useRouter();
  const remove = notesClient.useMutation('delete', '/api/v1/notes/{noteId}');
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState(false);

  async function deleteIt() {
    try {
      await remove.mutateAsync({ params: { path: { noteId: id } } });
      recordInteraction('note.deleted');
      router.push('/notes');
      router.refresh();
    } catch {
      setFailed(true);
    }
  }

  if (!asking) {
    return (
      <div className={styles.actions}>
        <Button variant="outline" tone="danger" onClick={() => setAsking(true)}>
          {t('delete')}
        </Button>
      </div>
    );
  }
  return (
    <Alert tone="warning" title={t('deleteQuestion')}>
      <div className={styles.actions}>
        <Button tone="danger" onClick={deleteIt} loading={remove.isPending}>
          {t('deleteForGood')}
        </Button>
        <Button variant="ghost" tone="neutral" onClick={() => setAsking(false)}>
          {t('keep')}
        </Button>
      </div>
      {failed ? <p>{t('deleteFailed')}</p> : null}
    </Alert>
  );
}
