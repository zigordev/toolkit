import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'auth:db',
    include: ['src/**/*.db.test.ts'],
    globalSetup: ['global-setup.ts'],
    hookTimeout: 120_000,
    testTimeout: 120_000,
  },
});
