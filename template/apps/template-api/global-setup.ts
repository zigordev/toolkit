import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { migrateDatabase } from '@zigordev/api';
import { createLogger } from '@zigordev/otel';
import { kafkaGlobalSetup } from '@zigordev/test/kafka';
import { postgresGlobalSetup } from '@zigordev/test/postgres';
import type { TestProject } from 'vitest/node';
import { migrations } from './src/migrate.ts';

function storeImage(): string {
  const model = JSON.parse(
    execFileSync('docker', ['compose', '--file', 'compose.yaml', 'config', '--format', 'json'], {
      cwd: fileURLToPath(new URL('../..', import.meta.url)),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  ) as { readonly services: Readonly<Record<string, { readonly image?: string }>> };
  const image = model.services['template-postgres']?.image;
  if (image === undefined) {
    throw new Error('compose.yaml names no image for template-postgres');
  }
  return image;
}

export const postgresImage = storeImage();

export const setupPostgres = postgresGlobalSetup({
  image: postgresImage,
  prepare: async (url) => {
    await migrateDatabase({
      url,
      folder: migrations,
      logger: createLogger({ service: 'template-api-migrate', level: 'error' }),
    });
  },
});

const kafka = kafkaGlobalSetup();

export async function setup(project: TestProject): Promise<() => Promise<void>> {
  const [stopPostgres, stopKafka] = await Promise.all([setupPostgres(project), kafka(project)]);
  return async () => {
    await Promise.all([stopPostgres(), stopKafka()]);
  };
}
