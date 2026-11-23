import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'template',
    include: ['*.test.ts'],
  },
});
