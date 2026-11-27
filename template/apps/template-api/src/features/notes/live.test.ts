import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { announceNote, notesChannel } from './live.ts';

function recorder() {
  const queries: SQL[] = [];
  return {
    queries,
    tx: {
      execute: async (query: SQL) => {
        queries.push(query);
      },
    },
  };
}

describe('announceNote', () => {
  it('names the change on the channel of the person who owns the note', async () => {
    const { queries, tx } = recorder();

    await announceNote(tx, 'note.updated', { id: 'n1', ownerId: 'u1' });

    const [query] = queries.map((each) => new PgDialect().sqlToQuery(each));
    expect(query?.params[0]).toBe('zigordev_live');
    expect(JSON.parse(String(query?.params[1]))).toEqual({
      channel: 'notes:u1',
      type: 'note.updated',
      id: 'n1',
    });
  });

  it('announces nothing for a note that belongs to nobody, or that was not found', async () => {
    const { queries, tx } = recorder();

    await announceNote(tx, 'note.created', { id: 'n2', ownerId: null });
    await announceNote(tx, 'note.deleted', undefined);

    expect(queries).toEqual([]);
  });
});

describe('notesChannel', () => {
  it('gives each person a channel of their own', () => {
    expect(notesChannel('u1')).toBe('notes:u1');
    expect(notesChannel('u2')).not.toBe(notesChannel('u1'));
  });
});
