import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import { clientOptions, kafkaSettings } from './settings.ts';

const schema = z.object(kafkaSettings);

describe('kafkaSettings', () => {
  it('reads a list of brokers, the user and the password', () => {
    expect(
      schema.parse({
        KAFKA_BROKERS: 'kafka:9092, kafka-2:9092,',
        KAFKA_USERNAME: 'template-api',
        KAFKA_PASSWORD: 'long-and-random',
      })
    ).toEqual({
      KAFKA_BROKERS: ['kafka:9092', 'kafka-2:9092'],
      KAFKA_USERNAME: 'template-api',
      KAFKA_PASSWORD: 'long-and-random',
    });
  });

  it.each(['', 'kafka', 'kafka:', ' , ', 'http://kafka:9092'])(
    'refuses the brokers %j',
    (value) => {
      expect(
        schema.safeParse({ KAFKA_BROKERS: value, KAFKA_USERNAME: 'a', KAFKA_PASSWORD: 'b' }).success
      ).toBe(false);
    }
  );

  it('needs a user and a password', () => {
    const result = schema.safeParse({ KAFKA_BROKERS: 'kafka:9092' });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0]).sort()).toEqual([
      'KAFKA_PASSWORD',
      'KAFKA_USERNAME',
    ]);
  });
});

describe('clientOptions', () => {
  it('signs in with SCRAM-SHA-512 and never creates a topic', () => {
    expect(
      clientOptions({
        clientId: 'template-api',
        brokers: ['kafka:9092'],
        username: 'template-api',
        password: 'secret',
      })
    ).toEqual({
      clientId: 'template-api',
      bootstrapBrokers: ['kafka:9092'],
      sasl: { mechanism: 'SCRAM-SHA-512', username: 'template-api', password: 'secret' },
      connectTimeout: 5_000,
      requestTimeout: 30_000,
      autocreateTopics: false,
    });
  });
});
