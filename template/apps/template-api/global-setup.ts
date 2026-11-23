import { migrateDatabase } from '@zigordev/api';
import { createLogger } from '@zigordev/otel';
import { postgresGlobalSetup } from '@zigordev/test/postgres';
import { migrations } from './src/migrate.ts';

export const postgresImage = 'postgres:18.7-alpine3.24';

export const setup = postgresGlobalSetup({
  image: postgresImage,
  prepare: async (url) => {
    await migrateDatabase({
      url,
      folder: migrations,
      logger: createLogger({ service: 'template-api-migrate', level: 'error' }),
    });
  },
});
