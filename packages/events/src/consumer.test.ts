import { describe, expect, it } from 'vitest';
import { namesUnknownTopic } from './consumer.ts';

describe('namesUnknownTopic', () => {
  const unknownTopic = { apiId: 'UNKNOWN_TOPIC_OR_PARTITION' };

  it("finds Kafka's answer that a topic does not exist, at the top, in a list of errors, or in a cause", () => {
    expect(namesUnknownTopic(Object.assign(new Error('top'), unknownTopic))).toBe(true);
    expect(
      namesUnknownTopic(
        new AggregateError([new Error('first'), Object.assign(new Error('second'), unknownTopic)])
      )
    ).toBe(true);
    expect(
      namesUnknownTopic(
        new Error('outer', { cause: Object.assign(new Error('inner'), unknownTopic) })
      )
    ).toBe(true);
  });

  it('finds the error the client makes of that answer while it reads the metadata, which keeps only its message', () => {
    expect(
      namesUnknownTopic(
        Object.assign(new Error('Unknown topic notes.absent.'), { code: 'PLT_KFK_USER' })
      )
    ).toBe(true);
    expect(
      namesUnknownTopic(
        Object.assign(new Error('Cannot consume while closing.'), { code: 'PLT_KFK_USER' })
      )
    ).toBe(false);
  });

  it('takes no other answer for it: a refused sign-in, a broker that does not answer, or no error at all', () => {
    expect(
      namesUnknownTopic(
        Object.assign(new Error('refused'), { apiId: 'SASL_AUTHENTICATION_FAILED' })
      )
    ).toBe(false);
    expect(namesUnknownTopic(new Error('connect ECONNREFUSED 127.0.0.1:9094'))).toBe(false);
    expect(namesUnknownTopic(undefined)).toBe(false);
    expect(namesUnknownTopic('UNKNOWN_TOPIC_OR_PARTITION')).toBe(false);
  });

  it('stops at an error that holds itself', () => {
    const looping: Error & { cause?: unknown } = new Error('loop');
    looping.cause = looping;
    expect(namesUnknownTopic(looping)).toBe(false);
  });
});
