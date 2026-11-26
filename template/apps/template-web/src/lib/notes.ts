export type NoteStatus = 'open' | 'done';

export interface NotesView {
  readonly status: NoteStatus | undefined;
  readonly q: string | undefined;
  readonly cursor: string | undefined;
}

export type NotesSearch = Readonly<Record<string, string | string[] | undefined>>;

const longestSearch = 100;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function viewOf(search: NotesSearch): NotesView {
  const status = single(search.status);
  const q = single(search.q)?.trim().slice(0, longestSearch);
  const cursor = single(search.cursor);
  return {
    status: status === 'open' || status === 'done' ? status : undefined,
    q: q === undefined || q === '' ? undefined : q,
    cursor: cursor === undefined || cursor === '' ? undefined : cursor,
  };
}

export function queryOf(view: NotesView): { status?: NoteStatus; q?: string; cursor?: string } {
  return {
    ...(view.status === undefined ? {} : { status: view.status }),
    ...(view.q === undefined ? {} : { q: view.q }),
    ...(view.cursor === undefined ? {} : { cursor: view.cursor }),
  };
}

export function hrefOf(view: Partial<NotesView>): string {
  const params = new URLSearchParams();
  if (view.status !== undefined) {
    params.set('status', view.status);
  }
  if (view.q !== undefined) {
    params.set('q', view.q);
  }
  if (view.cursor !== undefined) {
    params.set('cursor', view.cursor);
  }
  const query = params.toString();
  return query === '' ? '/notes' : `/notes?${query}`;
}
