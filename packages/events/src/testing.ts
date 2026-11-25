import { Admin } from '@platformatic/kafka';
import { clientOptions, type KafkaConnection } from './settings.ts';

export interface CreateTopicsOptions {
  readonly partitions?: number;
  readonly replicas?: number;
}

async function missing(admin: Admin, topics: readonly string[]): Promise<string[]> {
  const existing = new Set(await admin.listTopics());
  return [...new Set(topics)].filter((topic) => !existing.has(topic));
}

export async function createTopics(
  connection: KafkaConnection,
  topics: readonly string[],
  options: CreateTopicsOptions = {}
): Promise<void> {
  if (topics.length === 0) {
    return;
  }
  const admin = new Admin(clientOptions(connection));
  try {
    const wanted = await missing(admin, topics);
    if (wanted.length === 0) {
      return;
    }
    try {
      await admin.createTopics({
        topics: wanted,
        partitions: options.partitions ?? 1,
        replicas: options.replicas ?? 1,
      });
    } catch (error) {
      if ((await missing(admin, wanted)).length > 0) {
        throw error;
      }
    }
  } finally {
    await admin.close();
  }
}
