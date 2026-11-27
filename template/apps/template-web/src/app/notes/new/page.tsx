import { Breadcrumbs } from '@zigordev/ui';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getNextAuth } from '../../../lib/auth.ts';
import { NoteForm } from '../note-form.client.tsx';

export const dynamic = 'force-dynamic';

export default async function NewNote() {
  await getNextAuth().requireUser('/notes/new');
  const t = await getTranslations('notes');
  const nav = await getTranslations('nav');
  return (
    <>
      <Breadcrumbs
        label={nav('breadcrumbs')}
        links={[{ href: '/notes', label: nav('notes') }]}
        current={t('newTitle')}
        renderLink={(link) => <Link href={link.href} />}
      />
      <h1>{t('newTitle')}</h1>
      <NoteForm />
    </>
  );
}
