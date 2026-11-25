import { Admin } from '@platformatic/kafka';
import { describe, expect, it } from 'vitest';
import type { TestProject } from 'vitest/node';
import { type KafkaAccess, kafkaGlobalSetup, startKafka, uniqueTopic } from './kafka.ts';
import { postgresImage } from './postgres.ts';

function admin(access: KafkaAccess, password = access.password): Admin {
  return new Admin({
    clientId: 'test-kafka',
    bootstrapBrokers: [...access.brokers],
    sasl: { mechanism: 'SCRAM-SHA-512', username: access.username, password },
    retries: 0,
  });
}

describe('kafkaGlobalSetup', () => {
  it('provides a broker and a signed-in user, and stops the broker at teardown', async () => {
    const provided = new Map<string, unknown>();
    const project = {
      provide: (key: string, value: unknown) => provided.set(key, value),
    } as unknown as TestProject;

    const teardown = await kafkaGlobalSetup()(project);
    const access = provided.get('kafka') as KafkaAccess;
    try {
      expect(access.username).toBe('test');
      expect(access.password).toMatch(/^[0-9a-f]{48}$/);

      const client = admin(access);
      try {
        const topic = uniqueTopic('checks');
        await client.createTopics({ topics: [topic], partitions: 1, replicas: 1 });
        const metadata = await client.metadata({ topics: [topic] });
        expect(metadata.brokers.size).toBe(1);
        expect(metadata.topics.has(topic)).toBe(true);
        await expect(
          client.metadata({ topics: [uniqueTopic('missing')], autocreateTopics: true })
        ).rejects.toThrow();
      } finally {
        await client.close();
      }

      const refused = admin(access, 'wrong');
      try {
        await expect(refused.metadata({ topics: [] })).rejects.toThrow();
      } finally {
        await refused.close();
      }
    } finally {
      await teardown();
    }

    const gone = admin(access);
    try {
      await expect(gone.metadata({ topics: [] })).rejects.toThrow();
    } finally {
      await gone.close();
    }
  });
});

describe('startKafka', () => {
  it('stops its container and fails when the image runs no Kafka', async () => {
    await expect(startKafka({ image: postgresImage, startupTimeout: 5_000 })).rejects.toThrow();
  });
});
