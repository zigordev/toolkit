import { fileURLToPath } from 'node:url';
import { migrateDatabase } from '@zigordev/api';
import { createLogger } from '@zigordev/otel';
import { postgresGlobalSetup } from '@zigordev/test/postgres';

const folder = fileURLToPath(new URL('./test/drizzle', import.meta.url));

export default postgresGlobalSetup({
  prepare: async (url) => {
    await migrateDatabase({
      url,
      folder,
      logger: createLogger({ service: 'auth-test', level: 'warn' }),
    });
  },
});
