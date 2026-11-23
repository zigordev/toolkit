import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'template-api-client:db',
    include: ['src/**/*.db.test.ts'],
    globalSetup: ['../../apps/template-api/global-setup.ts'],
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
});
