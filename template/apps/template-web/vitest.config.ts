import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'template-web',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
  },
});
