import { sql } from 'drizzle-orm';
import { check, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const noteStatuses = ['open', 'done'] as const;

export const notes = pgTable(
  'notes',
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    title: text().notNull(),
    body: text().notNull().default(''),
    status: text({ enum: noteStatuses }).notNull().default('open'),
    createdAt: timestamp({ withTimezone: true, precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [check('notes_status_known', sql`${table.status} in ('open', 'done')`)]
);
