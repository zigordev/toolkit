import { configDefaults, defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'ui',
    include: ['scripts/**/*.test.ts'],
    exclude: [...configDefaults.exclude],
  },
});
