import { fileURLToPath } from 'node:url';
import { migrateDatabase } from '@zigordev/api';
import { createLogger } from '@zigordev/otel';
import { kafkaGlobalSetup } from '@zigordev/test/kafka';
import { postgresGlobalSetup } from '@zigordev/test/postgres';
import type { TestProject } from 'vitest/node';

const folder = fileURLToPath(new URL('./test/drizzle', import.meta.url));

const postgres = postgresGlobalSetup({
  prepare: async (url) => {
    await migrateDatabase({
      url,
      folder,
      logger: createLogger({ service: 'events-test', level: 'warn' }),
    });
  },
});

const kafka = kafkaGlobalSetup();

export async function setup(project: TestProject): Promise<() => Promise<void>> {
  const [stopPostgres, stopKafka] = await Promise.all([postgres(project), kafka(project)]);
  return async () => {
    await Promise.all([stopPostgres(), stopKafka()]);
  };
}
