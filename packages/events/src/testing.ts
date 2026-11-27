import { Admin } from '@platformatic/kafka';
import { clientOptions, type KafkaConnection } from './settings.ts';

export interface CreateTopicsOptions {
  readonly partitions?: number;
  readonly replicas?: number;
}

export const listedWithinMs = 30_000;
export const raceWithinMs = 5_000;

async function missing(admin: Admin, topics: readonly string[]): Promise<string[]> {
  const existing = new Set(await admin.listTopics());
  return [...new Set(topics)].filter((topic) => !existing.has(topic));
}

async function listedWithin(admin: Admin, topics: readonly string[], ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  for (;;) {
    if ((await missing(admin, topics)).length === 0) {
      return true;
    }
    if (Date.now() >= deadline) {
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
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
      if (!(await listedWithin(admin, wanted, raceWithinMs))) {
        throw error;
      }
      return;
    }
    if (!(await listedWithin(admin, wanted, listedWithinMs))) {
      throw new Error(
        `Kafka created ${wanted.join(', ')} but did not list them within ${listedWithinMs / 1000} seconds`
      );
    }
  } finally {
    await admin.close();
  }
}
