import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

export default defineProject({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    name: 'template-web:browser',
    include: ['browser/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
