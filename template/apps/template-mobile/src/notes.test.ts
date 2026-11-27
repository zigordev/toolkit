import { createTemplateApiClient } from 'template-api-client';
import { describe, expect, it, vi } from 'vitest';
import { statusOf } from './failure';
import {
  allNotes,
  changeOf,
  draftOf,
  filterOf,
  isFiltered,
  type Note,
  notesIn,
  notesQuery,
} from './notes';
import { createQueryClient } from './query-client';

function note(id: string, title: string, status: Note['status'] = 'open'): Note {
  const at = '2026-11-27T20:00:00.000Z';
  return { id, title, body: '', status, createdAt: at, updatedAt: at };
}

const first = note('00000000-0000-4000-8000-000000000001', 'Milk');
const second = note('00000000-0000-4000-8000-000000000002', 'Bread', 'done');

function apiWith(answer: (url: URL) => Response) {
  const asked: URL[] = [];
  const client = createTemplateApiClient({
    baseUrl: 'http://api.test',
    fetch: vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      asked.push(url);
      return answer(url);
    }),
  });
  return { client, asked };
}

describe('filterOf', () => {
  it('keeps a status and a search, trimmed as the web app trims them', () => {
    expect(filterOf('done', '  milk  ')).toEqual({ status: 'done', q: 'milk' });
  });

  it('shows all notes for no status and an empty search', () => {
    expect(filterOf(undefined, '   ')).toEqual(allNotes);
    expect(isFiltered(allNotes)).toBe(false);
    expect(isFiltered(filterOf('open', ''))).toBe(true);
    expect(isFiltered(filterOf(undefined, 'milk'))).toBe(true);
  });
});

describe('notesQuery', () => {
  it('asks for the first page with the filter and without a cursor', async () => {
    const { client, asked } = apiWith(() => Response.json({ items: [first] }));

    const data = await createQueryClient().fetchInfiniteQuery(
      notesQuery(client, filterOf('open', 'milk'))
    );

    expect(asked[0]?.pathname).toBe('/api/v1/notes');
    expect(asked[0]?.searchParams.get('status')).toBe('open');
    expect(asked[0]?.searchParams.get('q')).toBe('milk');
    expect(asked[0]?.searchParams.has('cursor')).toBe(false);
    expect(notesIn(data)).toEqual([first]);
  });

  it('asks for the next page with the cursor the last page gave, and adds its notes', async () => {
    const { client, asked } = apiWith((url) =>
      url.searchParams.get('cursor') === 'next-1'
        ? Response.json({ items: [second] })
        : Response.json({ items: [first], nextCursor: 'next-1' })
    );

    const data = await createQueryClient().fetchInfiniteQuery({
      ...notesQuery(client, allNotes),
      pages: 3,
    });

    expect(asked.map((url) => url.searchParams.get('cursor'))).toEqual([null, 'next-1']);
    expect(notesIn(data)).toEqual([first, second]);
  });

  it('fails with the problem the API answered, without asking again', async () => {
    const { client, asked } = apiWith(() =>
      Response.json({ status: 401, title: 'Unauthorized' }, { status: 401 })
    );

    const failure = await createQueryClient()
      .fetchInfiniteQuery(notesQuery(client, allNotes))
      .catch((error: unknown) => error);

    expect(statusOf(failure)).toBe(401);
    expect(asked).toHaveLength(1);
  });

  it('keeps each filter in a key of its own, under the list that a save refreshes', () => {
    const { client } = apiWith(() => Response.json({ items: [] }));

    expect(notesQuery(client, filterOf('done', '')).queryKey).toEqual([
      'get',
      '/api/v1/notes',
      { params: { query: { status: 'done' } } },
    ]);
  });
});

describe('notesIn', () => {
  it('has no notes before the first page arrives', () => {
    expect(notesIn(undefined)).toEqual([]);
  });
});

describe('a note in the form', () => {
  it('starts empty and open for a new note', () => {
    expect(draftOf()).toEqual({ title: '', body: '', done: false });
  });

  it('starts from the note being changed', () => {
    expect(draftOf(second)).toEqual({ title: 'Bread', body: '', done: true });
  });

  it('turns the form into the change the API takes', () => {
    expect(changeOf({ title: 'Milk', body: 'Two', done: false })).toEqual({
      title: 'Milk',
      body: 'Two',
      status: 'open',
    });
    expect(changeOf({ title: 'Milk', body: '', done: true }).status).toBe('done');
  });
});
