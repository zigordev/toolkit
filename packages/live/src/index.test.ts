import { describe, expect, it } from 'vitest';
import {
  changeMessage,
  liveNotice,
  maxChangesPerMessage,
  parseChangeMessage,
  parseNotice,
} from './index.ts';

describe('parseNotice', () => {
  it('reads a notice with a channel, a type and an id', () => {
    expect(parseNotice('{"channel":"notes:u1","type":"note.updated","id":"n1"}')).toEqual({
      channel: 'notes:u1',
      type: 'note.updated',
      id: 'n1',
    });
  });

  it('reads a notice without an id', () => {
    expect(parseNotice('{"channel":"notes:u1","type":"note.deleted_all"}')).toEqual({
      channel: 'notes:u1',
      type: 'note.deleted_all',
    });
  });

  it('gives nothing for a text that is not JSON', () => {
    expect(parseNotice('not json')).toBeUndefined();
  });

  it('gives nothing for a notice of the wrong shape', () => {
    expect(parseNotice('{"channel":"notes:u1"}')).toBeUndefined();
    expect(parseNotice('{"channel":"","type":"note.updated"}')).toBeUndefined();
    expect(parseNotice('{"channel":"notes:u1","type":"Note Updated"}')).toBeUndefined();
    expect(parseNotice('{"channel":"notes:u1","type":"note.updated","body":"x"}')).toBeUndefined();
  });
});

describe('the notice schema', () => {
  it('keeps every notice far below the 8000 bytes PostgreSQL allows', () => {
    const longest = JSON.stringify({
      channel: '\u{1F600}'.repeat(200),
      type: `a${'b'.repeat(99)}`,
      id: '\u{1F600}'.repeat(200),
    });

    expect(liveNotice.safeParse(JSON.parse(longest)).success).toBe(true);
    expect(Buffer.byteLength(longest)).toBeLessThan(8000);
  });

  it('refuses a type longer than 100 characters', () => {
    expect(liveNotice.safeParse({ channel: 'c', type: 'a'.repeat(101) }).success).toBe(false);
  });
});

describe('parseChangeMessage', () => {
  it('reads a message with its changes', () => {
    expect(
      parseChangeMessage('{"channel":"notes:u1","changes":[{"type":"note.created","id":"n2"}]}')
    ).toEqual({ channel: 'notes:u1', changes: [{ type: 'note.created', id: 'n2' }] });
  });

  it('gives nothing for a message without changes, or with too many', () => {
    expect(parseChangeMessage('{"channel":"notes:u1","changes":[]}')).toBeUndefined();
    const many = Array.from({ length: maxChangesPerMessage + 1 }, (_, index) => ({
      type: 'note.updated',
      id: `n${index}`,
    }));
    expect(changeMessage.safeParse({ channel: 'notes:u1', changes: many }).success).toBe(false);
  });

  it('gives nothing for a text that is not JSON', () => {
    expect(parseChangeMessage('{')).toBeUndefined();
  });
});
