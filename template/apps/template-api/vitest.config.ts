import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'template-api',
    include: ['src/**/*.test.ts'],
  },
});
