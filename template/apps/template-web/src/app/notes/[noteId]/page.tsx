import { LinkButton } from '@zigordev/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getNextAuth } from '../../../lib/auth.ts';
import { notesApi } from '../../../lib/notes-api.ts';
import styles from '../../layout.module.css';
import { DeleteNote } from '../delete-note.client.tsx';
import { LiveNotes } from '../live-notes.client.tsx';
import { NoteForm } from '../note-form.client.tsx';

export const dynamic = 'force-dynamic';

interface NoteProps {
  readonly params: Promise<{ readonly noteId: string }>;
}

export default async function Note({ params }: NoteProps) {
  const { noteId } = await params;
  await getNextAuth().requireUser(`/notes/${encodeURIComponent(noteId)}`);
  const { data, response } = await (await notesApi()).GET('/api/v1/notes/{noteId}', {
    params: { path: { noteId } },
  });
  if (response.status === 404 || response.status === 400) {
    notFound();
  }
  if (data === undefined) {
    throw new Error(`the API answered ${response.status} for a note`);
  }
  const t = await getTranslations('notes');
  return (
    <>
      <LiveNotes noteId={data.id} />
      <div className={styles.actions}>
        <LinkButton render={<Link href="/notes" />} variant="ghost" tone="neutral" size="sm">
          {t('back')}
        </LinkButton>
      </div>
      <h1>{data.title}</h1>
      <NoteForm note={data} />
      <DeleteNote id={data.id} />
    </>
  );
}
