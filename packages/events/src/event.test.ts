import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import { createEnvelope, defineEvent, readEnvelope } from './event.ts';

const noteCreated = defineEvent({
  type: 'note.created',
  version: 1,
  schema: z.object({ noteId: z.uuid(), title: z.string().min(1) }),
});

const noteDone = defineEvent({
  type: 'note.done',
  version: 2,
  schema: z.object({ noteId: z.uuid() }),
});

const noteId = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

describe('defineEvent', () => {
  it('keeps the type, the version and the schema, and freezes them', () => {
    expect(noteCreated.type).toBe('note.created');
    expect(noteCreated.version).toBe(1);
    expect(Object.isFrozen(noteCreated)).toBe(true);
  });

  it.each(['Note.Created', 'note', 'note created', 'note..created', '1note.created'])(
    'refuses the type %s',
    (type) => {
      expect(() => defineEvent({ type, version: 1, schema: z.object({}) })).toThrow(
        /lower case words joined by dots/
      );
    }
  );

  it.each([0, -1, 1.5])('refuses the version %s', (version) => {
    expect(() => defineEvent({ type: 'note.created', version, schema: z.object({}) })).toThrow(
      /whole number from 1/
    );
  });
});

describe('createEnvelope', () => {
  it('wraps checked data with an id, the type, the version and the time', () => {
    const envelope = createEnvelope(
      noteCreated,
      { noteId, title: 'Buy milk' },
      { id: '7d0f6e1a-4b8c-4d2e-9f3a-1b2c3d4e5f60', now: new Date('2026-11-25T09:00:00.000Z') }
    );

    expect(envelope).toEqual({
      id: '7d0f6e1a-4b8c-4d2e-9f3a-1b2c3d4e5f60',
      type: 'note.created',
      version: 1,
      occurredAt: '2026-11-25T09:00:00.000Z',
      data: { noteId, title: 'Buy milk' },
    });
  });

  it('gives each event an id of its own', () => {
    const first = createEnvelope(noteDone, { noteId });
    const second = createEnvelope(noteDone, { noteId });

    expect(first.id).not.toBe(second.id);
    expect(z.uuid().safeParse(first.id).success).toBe(true);
  });

  it('refuses data that does not match the schema', () => {
    expect(() => createEnvelope(noteCreated, { noteId, title: '' })).toThrow();
  });
});

describe('readEnvelope', () => {
  const events = [noteCreated, noteDone] as const;

  it('reads an event it knows, with its typed data', () => {
    const envelope = createEnvelope(noteDone, { noteId });

    const reading = readEnvelope(events, Buffer.from(JSON.stringify(envelope)));

    expect(reading).toEqual({ ok: true, event: envelope });
  });

  it('reads text as well as bytes', () => {
    const envelope = createEnvelope(noteCreated, { noteId, title: 'x' });

    expect(readEnvelope(events, JSON.stringify(envelope)).ok).toBe(true);
  });

  it.each([
    ['bytes that are not JSON', Buffer.from('{not json'), 'not_json'],
    ['an empty message', undefined, 'not_json'],
    ['JSON that is no event', Buffer.from('{"hello":"world"}'), 'not_an_event'],
  ])('rejects %s', (_name, value, reason) => {
    expect(readEnvelope(events, value)).toEqual({ ok: false, reason });
  });

  it('rejects an event it does not know, and names it', () => {
    const envelope = createEnvelope(noteCreated, { noteId, title: 'x' });
    const later = { ...envelope, version: 3 };

    expect(readEnvelope(events, JSON.stringify(later))).toEqual({
      ok: false,
      reason: 'unknown_type',
      id: envelope.id,
      type: 'note.created',
    });
  });

  it('rejects an event whose data breaks its schema', () => {
    const envelope = createEnvelope(noteDone, { noteId });
    const broken = { ...envelope, data: { noteId: 'not a uuid' } };

    expect(readEnvelope(events, JSON.stringify(broken))).toEqual({
      ok: false,
      reason: 'invalid_data',
      id: envelope.id,
      type: 'note.done',
    });
  });
});
