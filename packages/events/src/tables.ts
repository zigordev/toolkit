import {
  bigint,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const eventsOutbox = pgTable(
  'events_outbox',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    topic: text('topic').notNull(),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
    headers: jsonb('headers').$type<Record<string, string>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [index('events_outbox_created_at_idx').on(table.createdAt)]
);

export const handledEvents = pgTable(
  'events_handled',
  {
    consumer: text('consumer').notNull(),
    eventId: uuid('event_id').notNull(),
    handledAt: timestamp('handled_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.consumer, table.eventId] }),
    index('events_handled_handled_at_idx').on(table.handledAt),
  ]
);
