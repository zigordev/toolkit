import { configDefaults, defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'tokens',
    include: ['src/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'src/**/*.db.test.ts'],
  },
});
