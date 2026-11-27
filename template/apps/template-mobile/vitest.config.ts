import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'template-mobile',
    include: ['src/**/*.test.ts'],
  },
});
