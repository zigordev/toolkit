import { configDefaults, defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'api',
    include: ['src/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'src/**/*.db.test.ts'],
  },
});
