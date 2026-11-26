import { LinkButton } from '@zigordev/ui';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getNextAuth } from '../../../lib/auth.ts';
import styles from '../../layout.module.css';
import { NoteForm } from '../note-form.client.tsx';

export const dynamic = 'force-dynamic';

export default async function NewNote() {
  await getNextAuth().requireUser('/notes/new');
  const t = await getTranslations('notes');
  return (
    <>
      <div className={styles.actions}>
        <LinkButton render={<Link href="/notes" />} variant="ghost" tone="neutral" size="sm">
          {t('back')}
        </LinkButton>
      </div>
      <h1>{t('newTitle')}</h1>
      <NoteForm />
    </>
  );
}
