import { describe, expect, it } from 'vitest';
import { hrefOf, queryOf, viewOf } from './notes.ts';

describe('the view of the notes list', () => {
  it('reads the status, the search and the cursor from the address, and ignores the rest', () => {
    expect(viewOf({ status: 'done', q: '  milk  ', cursor: 'abc', other: 'x' })).toEqual({
      status: 'done',
      q: 'milk',
      cursor: 'abc',
    });
    expect(viewOf({ status: 'later', q: '   ', cursor: '' })).toEqual({
      status: undefined,
      q: undefined,
      cursor: undefined,
    });
    expect(viewOf({ status: ['open', 'done'], q: ['a', 'b'] })).toMatchObject({
      status: 'open',
      q: 'a',
    });
    expect(viewOf({ q: 'x'.repeat(150) }).q).toHaveLength(100);
  });

  it('asks the API only for what the view names', () => {
    expect(queryOf({ status: undefined, q: undefined, cursor: undefined })).toEqual({});
    expect(queryOf({ status: 'open', q: 'milk', cursor: 'abc' })).toEqual({
      status: 'open',
      q: 'milk',
      cursor: 'abc',
    });
  });

  it('writes the address of a view', () => {
    expect(hrefOf({})).toBe('/notes');
    expect(hrefOf({ status: 'done', q: 'milk & bread', cursor: 'abc' })).toBe(
      '/notes?status=done&q=milk+%26+bread&cursor=abc'
    );
  });
});
