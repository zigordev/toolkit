import { type InfiniteData, infiniteQueryOptions } from '@tanstack/react-query';
import type { paths, TemplateApiClient } from 'template-api-client';
import { type NoteStatus, queryOf, viewOf } from '../../template-web/src/lib/notes';

export type { NoteStatus };

export type NotesPage =
  paths['/api/v1/notes']['get']['responses'][200]['content']['application/json'];

export type Note = NotesPage['items'][number];

export interface NotesFilter {
  readonly status: NoteStatus | undefined;
  readonly q: string | undefined;
}

export const allNotes: NotesFilter = { status: undefined, q: undefined };

export function filterOf(status: NoteStatus | undefined, search: string): NotesFilter {
  const view = viewOf({ status, q: search });
  return { status: view.status, q: view.q };
}

export function isFiltered(filter: NotesFilter): boolean {
  return filter.status !== undefined || filter.q !== undefined;
}

export function notesQuery(client: TemplateApiClient, filter: NotesFilter) {
  const query = queryOf({ ...filter, cursor: undefined });
  return infiniteQueryOptions({
    queryKey: ['get', '/api/v1/notes', { params: { query } }] as const,
    queryFn: async ({ pageParam, signal }) => {
      const { data, error } = await client.GET('/api/v1/notes', {
        params: { query: queryOf({ ...filter, cursor: pageParam }) },
        signal,
      });
      if (data === undefined) {
        throw error;
      }
      return data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page: NotesPage) => page.nextCursor,
  });
}

export function notesIn(data: InfiniteData<NotesPage> | undefined): readonly Note[] {
  return data?.pages.flatMap((page) => page.items) ?? [];
}

export interface NoteDraft {
  readonly title: string;
  readonly body: string;
  readonly done: boolean;
}

export function draftOf(note?: Pick<Note, 'title' | 'body' | 'status'>): NoteDraft {
  return { title: note?.title ?? '', body: note?.body ?? '', done: note?.status === 'done' };
}

export function changeOf({ title, body, done }: NoteDraft) {
  const status: NoteStatus = done ? 'done' : 'open';
  return { title, body, status };
}
