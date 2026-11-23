import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'otel',
    include: ['src/**/*.test.ts'],
    testTimeout: 20_000,
  },
});
