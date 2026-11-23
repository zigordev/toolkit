import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'api:db',
    include: ['src/**/*.db.test.ts'],
    globalSetup: ['global-setup.ts'],
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
});
