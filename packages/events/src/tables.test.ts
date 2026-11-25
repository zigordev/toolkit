import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { eventsOutbox, handledEvents } from './tables.ts';

describe('the outbox table', () => {
  it('keeps the rows in the order they were saved, and finds the oldest by its time', () => {
    const config = getTableConfig(eventsOutbox);

    expect(config.name).toBe('events_outbox');
    expect(config.columns.map((column) => column.name)).toEqual([
      'id',
      'topic',
      'key',
      'value',
      'headers',
      'created_at',
    ]);
    expect(config.columns.find((column) => column.name === 'id')?.primary).toBe(true);
    expect(config.indexes.map((index) => index.config.name)).toEqual([
      'events_outbox_created_at_idx',
    ]);
  });
});

describe('the handled events table', () => {
  it('holds each event once per consumer, and finds the old rows by their time', () => {
    const config = getTableConfig(handledEvents);

    expect(config.name).toBe('events_handled');
    expect(config.primaryKeys.map((key) => key.columns.map((column) => column.name))).toEqual([
      ['consumer', 'event_id'],
    ]);
    expect(config.indexes.map((index) => index.config.name)).toEqual([
      'events_handled_handled_at_idx',
    ]);
  });
});
