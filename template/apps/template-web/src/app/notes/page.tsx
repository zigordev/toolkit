import { Alert, Button, LinkButton, TextField } from '@zigordev/ui';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getNextAuth } from '../../lib/auth.ts';
import { getLogger } from '../../lib/logger.ts';
import { hrefOf, type NotesSearch, queryOf, viewOf } from '../../lib/notes.ts';
import { notesApi } from '../../lib/notes-api.ts';
import styles from '../layout.module.css';
import { LiveNotes } from './live-notes.client.tsx';
import notes from './notes.module.css';

export const dynamic = 'force-dynamic';

interface NotesProps {
  readonly searchParams: Promise<NotesSearch>;
}

async function pageOf(query: ReturnType<typeof queryOf>) {
  try {
    const { data } = await (await notesApi()).GET('/api/v1/notes', { params: { query } });
    return data;
  } catch (error) {
    getLogger().warn({ event: 'api.unreachable', error });
    return undefined;
  }
}

export default async function Notes({ searchParams }: NotesProps) {
  const view = viewOf(await searchParams);
  await getNextAuth().requireUser(hrefOf(view));
  const t = await getTranslations('notes');
  const page = await pageOf(queryOf(view));
  const filters = [
    { status: undefined, label: t('allNotes') },
    { status: 'open' as const, label: t('openNotes') },
    { status: 'done' as const, label: t('doneNotes') },
  ];
  return (
    <>
      <LiveNotes />
      <h1>{t('title')}</h1>
      <div className={styles.actions}>
        <LinkButton render={<Link href="/notes/new" />}>{t('new')}</LinkButton>
      </div>
      <search>
        <form className={notes.search} action="/notes">
          <TextField
            className={notes.query}
            label={t('searchLabel')}
            type="search"
            name="q"
            defaultValue={view.q ?? ''}
          />
          {view.status === undefined ? null : (
            <input type="hidden" name="status" value={view.status} />
          )}
          <Button type="submit" variant="soft">
            {t('search')}
          </Button>
        </form>
      </search>
      <nav aria-label={t('filterLabel')} className={styles.actions}>
        {filters.map(({ status, label }) => (
          <LinkButton
            key={label}
            render={<Link href={hrefOf({ status, q: view.q })} />}
            variant={view.status === status ? 'soft' : 'ghost'}
            tone="neutral"
            size="sm"
            aria-current={view.status === status ? 'page' : undefined}
          >
            {label}
          </LinkButton>
        ))}
      </nav>
      {page === undefined ? (
        <Alert tone="danger">{t('loadFailed')}</Alert>
      ) : page.items.length === 0 ? (
        <p>{view.q === undefined && view.status === undefined ? t('empty') : t('noMatch')}</p>
      ) : (
        <ul className={notes.list}>
          {page.items.map((note) => (
            <li key={note.id} className={notes.item}>
              <LinkButton
                render={<Link href={`/notes/${note.id}`} />}
                variant="ghost"
                tone="neutral"
              >
                {note.title}
              </LinkButton>
              <span className={notes.status}>{note.status === 'done' ? t('done') : t('open')}</span>
            </li>
          ))}
        </ul>
      )}
      {page?.nextCursor === undefined ? null : (
        <div className={styles.actions}>
          <LinkButton
            render={<Link href={hrefOf({ ...view, cursor: page.nextCursor })} />}
            variant="outline"
            tone="neutral"
          >
            {t('more')}
          </LinkButton>
        </div>
      )}
    </>
  );
}
