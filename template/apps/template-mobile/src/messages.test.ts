import { describe, expect, it } from 'vitest';
import { messages } from './messages';

describe('the messages', () => {
  it('are the web app’s texts, in both languages, with the same keys', () => {
    expect(messages.en.home.apiDown).toBe('The API does not answer.');
    expect(messages.es.home.apiDown).toBe('La API no contesta.');
    expect(Object.keys(messages.es).sort()).toEqual(Object.keys(messages.en).sort());
  });
});
