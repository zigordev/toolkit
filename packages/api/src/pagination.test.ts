import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import { decodeCursor, encodeCursor, listQuery, pageOf, parseSort } from './pagination.ts';
import { ProblemError } from './problems.ts';

describe('listQuery', () => {
  const query = listQuery({
    filters: { status: z.enum(['open', 'done']).optional() },
    sort: ['title', 'createdAt'],
    defaultSort: '-createdAt',
  });

  it('fills in the default sort and limit', () => {
    expect(query.parse({})).toEqual({ sort: '-createdAt', limit: 20 });
  });

  it('reads a limit from the query string, as text', () => {
    expect(query.parse({ limit: '100', sort: 'title' })).toMatchObject({ limit: 100 });
  });

  it('refuses an unknown field, a sort it does not know and a limit out of range', () => {
    expect(query.safeParse({ owner: 'me' }).success).toBe(false);
    expect(query.safeParse({ sort: 'owner' }).success).toBe(false);
    expect(query.safeParse({ limit: '101' }).success).toBe(false);
    expect(query.safeParse({ limit: '2.5' }).success).toBe(false);
  });
});

describe('parseSort', () => {
  it('reads a minus as descending', () => {
    expect(parseSort('-createdAt')).toEqual({ field: 'createdAt', direction: 'desc' });
    expect(parseSort('title')).toEqual({ field: 'title', direction: 'asc' });
  });
});

describe('cursors', () => {
  it('give back the values they were made from, for the same sort', () => {
    const cursor = encodeCursor('-createdAt', ['2026-11-23T10:00:00.000Z', 'a1', 3, true, null]);

    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(cursor, '-createdAt', 5)).toEqual([
      '2026-11-23T10:00:00.000Z',
      'a1',
      3,
      true,
      null,
    ]);
  });

  function refusal(cursor: string, sort = 'title', length = 2): unknown {
    try {
      decodeCursor(cursor, sort, length);
    } catch (error) {
      return error;
    }
    return undefined;
  }

  it.each([
    ['text that is not base64url JSON', '%%%'],
    ['JSON that is not an object', Buffer.from('42').toString('base64url')],
    ['a cursor of another sort', encodeCursor('-title', ['a', 'b'])],
    ['a cursor with the wrong number of values', encodeCursor('title', ['a'])],
    ['a cursor with an object inside', encodeCursor('title', ['a', { id: 1 } as never])],
    ['a cursor without values', Buffer.from('{"s":"title"}').toString('base64url')],
  ])('refuse %s as an invalid field of the query', (_name, cursor) => {
    const error = refusal(cursor);

    expect(error).toBeInstanceOf(ProblemError);
    expect(error).toMatchObject({
      status: 400,
      code: 'request.invalid',
      params: { errors: [expect.objectContaining({ in: 'querystring', pointer: '/cursor' })] },
    });
  });
});

describe('pageOf', () => {
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('gives no cursor when the rows fit in the page', () => {
    expect(pageOf(rows, 3, 'id', (row) => [row.id])).toEqual({ items: rows });
  });

  it('cuts the page at the limit, and points the cursor at its last item', () => {
    const page = pageOf(rows, 2, 'id', (row) => [row.id]);

    expect(page.items).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(decodeCursor(page.nextCursor ?? '', 'id', 1)).toEqual(['b']);
  });
});
