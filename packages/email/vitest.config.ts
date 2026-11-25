import { configDefaults, defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'email',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    exclude: [...configDefaults.exclude],
  },
});
