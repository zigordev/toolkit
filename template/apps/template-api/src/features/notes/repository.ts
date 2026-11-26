import { afterCursor, type CursorValue, keysetOrder, type SortDirection } from '@zigordev/api';
import { and, eq, ilike, type SQL, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { notes } from '../../db/schema.ts';
import type { CreateNote, UpdateNote } from './schemas.ts';

export type NoteRow = typeof notes.$inferSelect;
export type Database = NodePgDatabase<{ notes: typeof notes }>;

export type Reach = { readonly ownerId: string } | 'all';

export type NewNote = CreateNote & { readonly ownerId: string | null };

export interface NoteListing {
  readonly status: NoteRow['status'] | undefined;
  readonly q: string | undefined;
  readonly field: 'createdAt' | 'updatedAt' | 'title';
  readonly direction: SortDirection;
  readonly after: readonly CursorValue[] | undefined;
  readonly limit: number;
}

function within(reach: Reach): SQL | undefined {
  return reach === 'all' ? undefined : eq(notes.ownerId, reach.ownerId);
}

function literal(text: string): string {
  return text.replaceAll(/[\\%_]/g, (character) => `\\${character}`);
}

export function notesRepository(db: Database) {
  return {
    async list(listing: NoteListing, reach: Reach): Promise<NoteRow[]> {
      const columns = [notes[listing.field], notes.id] as const;
      return db
        .select()
        .from(notes)
        .where(
          and(
            within(reach),
            listing.status === undefined ? undefined : eq(notes.status, listing.status),
            listing.q === undefined ? undefined : ilike(notes.title, `%${literal(listing.q)}%`),
            afterCursor(columns, listing.direction, listing.after)
          )
        )
        .orderBy(...keysetOrder(columns, listing.direction))
        .limit(listing.limit + 1);
    },
    async find(id: string, reach: Reach): Promise<NoteRow | undefined> {
      const [row] = await db
        .select()
        .from(notes)
        .where(and(eq(notes.id, id), within(reach)));
      return row;
    },
    async create(note: NewNote): Promise<NoteRow> {
      const [row] = await db.insert(notes).values(note).returning();
      return row as NoteRow;
    },
    async update(id: string, change: UpdateNote, reach: Reach): Promise<NoteRow | undefined> {
      const [row] = await db
        .update(notes)
        .set({ ...change, updatedAt: sql`now()` })
        .where(and(eq(notes.id, id), within(reach)))
        .returning();
      return row;
    },
    async remove(id: string, reach: Reach): Promise<boolean> {
      const removed = await db
        .delete(notes)
        .where(and(eq(notes.id, id), within(reach)))
        .returning({ id: notes.id });
      return removed.length > 0;
    },
  };
}

export type NotesRepository = ReturnType<typeof notesRepository>;
