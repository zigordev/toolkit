import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'dev',
    include: ['*.test.js', 'src/**/*.test.ts'],
  },
});
