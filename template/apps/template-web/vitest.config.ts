import { configDefaults, defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'template-web',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: [...configDefaults.exclude, 'src/**/*.client.test.tsx'],
    setupFiles: ['./vitest.setup.ts'],
    server: { deps: { inline: ['@zigordev/auth'] } },
  },
});
