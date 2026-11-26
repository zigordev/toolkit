import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'rum',
    include: ['src/**/*.test.ts'],
  },
});
